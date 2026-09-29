import "server-only";
import { createHash } from "node:crypto";
import type { Prisma, ResourceKind } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { getAIStatus } from "@/lib/ai";
import { enrichResourceWords } from "@/lib/ai/tasks";
import { aiErrorMessage } from "@/lib/ai/types";
import type { Draft, DraftVocabulary, ResourceEnrichment } from "@/lib/ai/schemas";
import { draftId } from "@/lib/lessons/draft";
import { containsHanzi, normalizeHanzi } from "@/lib/chinese/text";
import { hskDictionary, hskLookup } from "@/lib/chinese/hsk";
import { analyzeText, contextAt, tokenize, type TextAnalysis, type WordInfo } from "@/lib/resources/analyze";
import { logError } from "@/lib/log";
import { segmentAt, segmentOffsets, segmentParts, segmentsText, youTubeId, youTubeUrl, type Segment, type SegmentPart } from "@/lib/resources/video";
import { extractDocument, fetchArticle, normalizeResourceText, normalizeSegments, parseHttpUrl, ResourceError, toSimplified, type SourceText } from "./resource-sources";
import { downloadAudio, fetchCaptions, fetchVideoInfo, pickChineseTrack, transcriptionToolsStatus, AUDIO_SAMPLE_RATE } from "./youtube";
import { isLocalSttEnabled, transcribeLong } from "./transcribe";
import { startAnalysis } from "./lessons";
import { getUser, getUserId } from "./user";

export { ResourceError } from "./resource-sources";

/** Mots cochés par défaut : assez pour apprendre, pas au point de noyer les révisions. */
export const DEFAULT_SELECTED = 15;
const MAX_USEFUL = 60;
const MAX_RARE = 30;
/** Mots par appel IA : les lots sont traités en parallèle (réponse plus rapide). */
const AI_BATCH = 30;
const AI_EXCERPT_CHARS = 6000;

const json = (v: unknown) => v as Prisma.InputJsonValue;

// ─── Mots connus ──────────────────────────────────────────────────────────────

/** Mots de tes connaissances (vocabulaire, expressions) et mots déclarés connus. */
export async function knownWords(userId: string): Promise<Set<string>> {
  const [vocab, declared] = await Promise.all([
    prisma.vocabulary.findMany({
      where: { knowledgeItem: { userId } },
      select: { hanzi: true },
    }),
    prisma.knownWord.findMany({ where: { userId }, select: { hanzi: true } }),
  ]);
  const set = new Set<string>();
  for (const v of vocab) {
    const k = normalizeHanzi(v.hanzi);
    if (k) set.add(k);
  }
  for (const d of declared) set.add(d.hanzi);
  return set;
}

export function analyzeWithKnown(text: string, known: Set<string>, hskLevel: number): TextAnalysis {
  const hsk = hskDictionary();
  const tokens = tokenize(text, { has: (w) => hsk.has(w) || known.has(w) });
  return analyzeText(text, tokens, { known, hskLevel, lookup: hskLookup });
}

// ─── Import ───────────────────────────────────────────────────────────────────

export type NewResourceInput =
  | { kind: "TEXT"; text: string; title?: string | null }
  | { kind: "ARTICLE"; url: string }
  | { kind: "DOCUMENT"; filename: string; data: Uint8Array }
  | { kind: "VIDEO"; url: string };

export interface CreateResourceResult {
  lessonId: string;
  duplicateOf: { lessonId: string; title: string } | null;
}

function textHash(text: string): string {
  return createHash("sha256").update(normalizeHanzi(text)).digest("hex").slice(0, 16);
}

/** Durée maximale transcrite par Whisper (la transcription locale prend environ 2 fois la durée de la vidéo). */
export function whisperMaxSeconds(): number {
  const m = Number(process.env.WHISPER_VIDEO_MAX_MINUTES);
  return (Number.isFinite(m) && m > 0 ? m : 15) * 60;
}

interface VideoSource {
  mediaId: string;
  url: string;
  title: string | null;
  author: string | null;
  durationSec: number | null;
  /** null : pas de sous-titres chinois, transcription Whisper à faire. */
  captions: {
    segments: Segment[];
    auto: boolean;
    convertedFromTraditional: boolean;
    truncated: boolean;
  } | null;
}

async function loadVideo(rawUrl: string): Promise<VideoSource> {
  const url = parseHttpUrl(rawUrl);
  const id = youTubeId(url);
  if (!id) throw new ResourceError("Ce lien n'est pas une vidéo YouTube. Copie l'adresse de la vidéo (youtube.com/watch?v=… ou youtu.be/…).");
  const info = await fetchVideoInfo(id);
  const track = pickChineseTrack(info.tracks);
  const base = {
    mediaId: id,
    url: youTubeUrl(id),
    title: info.title ? await toSimplified(info.title) : null,
    author: info.author,
    durationSec: info.durationSec,
  };
  if (track) {
    const normalized = await normalizeSegments(await fetchCaptions(track));
    return { ...base, captions: { ...normalized, auto: track.auto } };
  }
  const tools = await transcriptionToolsStatus();
  if (!isLocalSttEnabled() || !tools.ytDlp || !tools.ffmpeg) {
    const missing = [!tools.ytDlp && "yt-dlp", !tools.ffmpeg && "ffmpeg"].filter(Boolean).join(" et ");
    throw new ResourceError(
      !isLocalSttEnabled()
        ? "Cette vidéo n'a pas de sous-titres chinois et la transcription locale est désactivée (STT_PROVIDER=none). Colle la transcription à la place."
        : `Cette vidéo n'a pas de sous-titres chinois. Pour la transcrire avec Whisper, installe ${missing} (brew install ${missing.replace(" et ", " ")}) puis relance l'application.`,
    );
  }
  return { ...base, captions: null };
}

async function createVideoResource(userId: string, rawUrl: string): Promise<CreateResourceResult> {
  const video = await loadVideo(rawUrl);
  const text = video.captions ? segmentsText(video.captions.segments) : "";
  const previous = await prisma.resource.findFirst({
    where: { userId, url: video.url },
    include: { lesson: { select: { id: true, title: true } } },
  });
  const warnings: string[] = [];
  if (video.captions?.truncated) warnings.push("Vidéo très longue : seuls les 30 000 premiers caractères des sous-titres ont été gardés.");
  if (!video.captions && video.durationSec && video.durationSec > whisperMaxSeconds()) {
    const minutes = Math.round(whisperMaxSeconds() / 60);
    warnings.push(`Vidéo longue : seule${minutes > 1 ? `s les ${minutes} premières minutes sont transcrites` : " la première minute est transcrite"}.`);
  }
  const lesson = await prisma.lesson.create({
    data: {
      userId,
      kind: "RESOURCE",
      title: (video.title ?? "Vidéo YouTube").slice(0, 200),
      titleChinese: video.title && containsHanzi(video.title) ? video.title.slice(0, 200) : null,
      date: new Date(),
      topics: json([]),
      analysisWarnings: json(warnings),
      processingStatus: video.captions ? "ANALYZING" : "EXTRACTING",
      resource: {
        create: {
          userId,
          kind: "VIDEO",
          url: video.url,
          siteName: video.author,
          text,
          convertedFromTraditional: video.captions?.convertedFromTraditional ?? false,
          mediaId: video.mediaId,
          durationSec: video.durationSec,
          segments: video.captions ? json(video.captions.segments) : undefined,
          transcriptSource: video.captions ? (video.captions.auto ? "AUTO_CAPTIONS" : "CAPTIONS") : "WHISPER",
        },
      },
    },
  });
  void startAnalysis(lesson.id);
  return {
    lessonId: lesson.id,
    duplicateOf: previous ? { lessonId: previous.lesson.id, title: previous.lesson.title } : null,
  };
}

export async function createResource(input: NewResourceInput): Promise<CreateResourceResult> {
  const userId = await getUserId();
  // Un lien YouTube collé dans l'onglet « Lien » est traité comme une vidéo.
  if (input.kind === "VIDEO" || (input.kind === "ARTICLE" && youTubeId(parseHttpUrl(input.url)))) {
    return createVideoResource(userId, input.url);
  }
  let source: SourceText;
  let url: string | null = null;
  let filename: string | null = null;
  if (input.kind === "TEXT") {
    if (!input.text.trim()) throw new ResourceError("Colle un texte en chinois.");
    source = await normalizeResourceText(input.text, {
      title: input.title ?? null,
    });
  } else if (input.kind === "ARTICLE") {
    source = await fetchArticle(input.url);
    url = new URL(input.url.trim()).toString();
  } else {
    filename = input.filename.replace(/[/\\]/g, "_").slice(0, 200) || "document";
    source = await extractDocument(filename, input.data);
  }

  // Doublon : même lien ou même texte déjà importé.
  const hash = textHash(source.text);
  const previous = await prisma.resource.findMany({
    where: {
      userId,
      ...(url ? { OR: [{ url }, { text: { startsWith: source.text.slice(0, 200) } }] } : { text: { startsWith: source.text.slice(0, 200) } }),
    },
    include: { lesson: { select: { id: true, title: true } } },
    take: 5,
  });
  const dup = previous.find((r) => r.url === url && url) ?? previous.find((r) => textHash(r.text) === hash) ?? null;

  const fallbackTitle =
    source.title ||
    (input.kind === "TEXT"
      ? `Texte : ${source.text.replace(/\s+/g, "").slice(0, 16)}…`
      : input.kind === "ARTICLE"
        ? (source.siteName ?? "Article")
        : (filename ?? "Document"));
  const lesson = await prisma.lesson.create({
    data: {
      userId,
      kind: "RESOURCE",
      title: fallbackTitle.slice(0, 200),
      titleChinese: source.title && containsHanzi(source.title) ? source.title.slice(0, 200) : null,
      date: new Date(),
      topics: json([]),
      analysisWarnings: json([]),
      processingStatus: "ANALYZING",
      resource: {
        create: {
          userId,
          kind: input.kind as ResourceKind,
          url,
          siteName: source.siteName,
          filename,
          text: source.text,
          convertedFromTraditional: source.convertedFromTraditional,
        },
      },
    },
  });
  if (source.truncated) {
    await prisma.lesson.update({
      where: { id: lesson.id },
      data: {
        analysisWarnings: json(["Ressource très longue : seuls les 30 000 premiers caractères ont été gardés."]),
      },
    });
  }
  void startAnalysis(lesson.id);
  return {
    lessonId: lesson.id,
    duplicateOf: dup ? { lessonId: dup.lesson.id, title: dup.lesson.title } : null,
  };
}

// ─── Analyse ──────────────────────────────────────────────────────────────────

type VocabItem = DraftVocabulary;

/** Moment de la vidéo (secondes) correspondant à une position du texte, null hors vidéo. */
type TimeAt = (index: number) => number | null;
const noTime: TimeAt = () => null;

function videoTimeAt(segments: unknown): TimeAt {
  if (!Array.isArray(segments) || !segments.length) return noTime;
  const segs = segments as Segment[];
  const offsets = segmentOffsets(segs);
  return (index) => {
    if (index < 0) return null;
    const i = segmentAt(offsets, index);
    return i >= 0 ? segs[i].s : null;
  };
}

function baseItem(w: WordInfo, decision: "approved" | "pending", timeAt: TimeAt = noTime): VocabItem {
  return {
    id: draftId("r"),
    decision,
    edited: false,
    duplicate: null,
    kind: "VOCABULARY",
    hanzi: w.word,
    pinyin: w.hsk?.pinyin || null,
    pinyinSource: w.hsk?.pinyin ? "EXTERNAL" : null,
    french: null,
    frenchSource: null,
    english: w.hsk?.english || null,
    englishSource: w.hsk?.english ? "EXTERNAL" : null,
    partOfSpeech: null,
    notes: null,
    examples: [
      {
        hanzi: w.context,
        pinyin: null,
        french: null,
        english: null,
        source: "EXTERNAL",
        translationSource: null,
      },
    ],
    sourcePage: null,
    sourceText: w.context,
    confidence: "MEDIUM",
    highlighted: false,
    resource: {
      tier: w.tier ?? "rare",
      hsk: w.hsk?.level ?? null,
      count: w.count,
      time: timeAt(w.firstIndex),
    },
  };
}

function countOccurrences(text: string, word: string): number {
  let n = 0;
  for (let i = text.indexOf(word); i >= 0; i = text.indexOf(word, i + word.length)) n++;
  return n;
}

/** Applique l'enrichissement IA : sens en contexte, pinyin, formes corrigées, expressions. */
function applyEnrichment(
  text: string,
  candidates: { id: string; info: WordInfo }[],
  ai: ResourceEnrichment,
  known: Set<string>,
  timeAt: TimeAt,
): { items: VocabItem[]; ignored: number } {
  const byId = new Map(ai.words.map((w) => [w.id, w]));
  const items: VocabItem[] = [];
  let ignored = 0;
  for (const { id, info } of candidates) {
    const e = byId.get(id);
    const item = baseItem(info, "pending", timeAt);
    if (e) {
      if (!e.keep) {
        ignored++;
        continue;
      }
      // Forme corrigée acceptée seulement si elle figure dans le texte.
      const corrected = e.hanzi.trim();
      if (corrected && corrected !== info.word && text.includes(corrected)) {
        const hsk = hskLookup(corrected);
        const idx = text.indexOf(corrected);
        item.hanzi = corrected;
        item.resource = {
          tier: info.tier ?? "rare",
          hsk: hsk?.level ?? null,
          count: countOccurrences(text, corrected),
          time: timeAt(idx),
        };
        item.english = hsk?.english || null;
        item.englishSource = hsk?.english ? "EXTERNAL" : null;
        item.sourceText = contextAt(text, idx, corrected);
        item.examples = [{ ...item.examples[0], hanzi: item.sourceText }];
      }
      if (e.pinyin.trim()) {
        item.pinyin = e.pinyin.trim();
        item.pinyinSource = "AI";
      }
      if (e.french.trim()) {
        item.french = e.french.trim();
        item.frenchSource = "AI";
      }
      item.partOfSpeech = e.partOfSpeech;
      item.kind = e.kind;
      if (e.contextFrench && item.examples[0].hanzi === info.context) {
        item.examples = [
          {
            ...item.examples[0],
            french: e.contextFrench,
            translationSource: "AI",
          },
        ];
      }
    }
    if (known.has(normalizeHanzi(item.hanzi))) continue;
    items.push(item);
  }
  for (const x of ai.expressions) {
    const hanzi = x.hanzi.trim();
    // Une expression réutilisable reste courte (au-delà, c'est un morceau de phrase propre au texte).
    if ([...hanzi].length > 8 || !text.includes(hanzi) || known.has(normalizeHanzi(hanzi))) continue;
    const idx = text.indexOf(hanzi);
    const context = contextAt(text, idx, hanzi);
    const hsk = hskLookup(hanzi);
    items.push({
      ...baseItem(
        {
          word: hanzi,
          count: countOccurrences(text, hanzi),
          status: "new",
          hsk: hsk ?? null,
          context,
          firstIndex: idx,
          tier: "useful",
          score: 10,
        },
        "pending",
        timeAt,
      ),
      kind: "EXPRESSION",
      pinyin: x.pinyin.trim() || hsk?.pinyin || null,
      pinyinSource: x.pinyin.trim() ? "AI" : hsk?.pinyin ? "EXTERNAL" : null,
      french: x.french.trim() || null,
      frenchSource: x.french.trim() ? "AI" : null,
      examples: [
        {
          hanzi: context,
          pinyin: null,
          french: x.contextFrench,
          english: null,
          source: "EXTERNAL",
          translationSource: x.contextFrench ? "AI" : null,
        },
      ],
    });
  }
  return { items, ignored };
}

/**
 * Pertinence d'un mot pour l'apprentissage : fréquence dans le texte (le sujet de la ressource),
 * proximité avec ton niveau HSK, mot de plusieurs caractères (plus réutilisable qu'un caractère isolé).
 */
export function wordPriority(r: { count: number; hsk: number | null }, hanzi: string, hskLevel: number): number {
  let p = Math.min(r.count, 6);
  if (r.hsk !== null) p += r.hsk <= hskLevel + 2 ? 2 : r.hsk <= hskLevel + 4 ? 1 : 0;
  else if (r.count >= 2) p += 0.5;
  if ([...hanzi].length >= 2) p += 1;
  return p;
}

/**
 * Dédoublonne (formes corrigées identiques), trie par pertinence et coche les mots les plus utiles
 * (les expressions citées une seule fois et hors HSK ne sont pas cochées d'office).
 */
function finalizeItems(items: VocabItem[], hskLevel: number): VocabItem[] {
  const seen = new Map<string, VocabItem>();
  for (const it of items) {
    const k = normalizeHanzi(it.hanzi);
    if (!k) continue;
    const prev = seen.get(k);
    if (!prev) seen.set(k, it);
    else if (prev.resource && it.resource) prev.resource.count = Math.max(prev.resource.count, it.resource.count);
  }
  const list = [...seen.values()];
  const prio = (i: VocabItem) => (i.resource ? wordPriority(i.resource, i.hanzi, hskLevel) : 0);
  const useful = list
    .filter((i) => i.resource?.tier === "useful")
    .map((item, idx) => ({ item, idx, p: prio(item) }))
    .sort((a, b) => b.p - a.p || a.idx - b.idx)
    .map((x) => x.item);
  let budget = DEFAULT_SELECTED;
  for (const it of useful) {
    if (budget <= 0) break;
    if (!it.french && !it.english) continue;
    if (it.resource && it.resource.hsk === null && it.resource.count < 2) continue;
    it.decision = "approved";
    budget--;
  }
  return [...useful, ...list.filter((i) => i.resource?.tier !== "useful")];
}

export async function runResourceAnalysis(lessonId: string, mode: "auto" | "heuristic" = "auto"): Promise<void> {
  const lesson = await prisma.lesson.findUnique({
    where: { id: lessonId },
    include: { resource: true, user: true },
  });
  if (!lesson?.resource) throw new ResourceError("Ressource introuvable.");
  const { user } = lesson;
  let { resource } = lesson;
  if (resource.kind === "VIDEO" && resource.transcriptSource === "WHISPER" && !resource.text) {
    resource = await transcribeVideo(lessonId, resource.mediaId);
  }
  await prisma.lesson.update({
    where: { id: lessonId },
    data: { processingStatus: "ANALYZING", analysisError: null },
  });
  const timeAt = videoTimeAt(resource.segments);

  const known = await knownWords(user.id);
  const analysis = analyzeWithKnown(resource.text, known, user.hskLevel);
  const fresh = analysis.words.filter((w) => w.status === "new");
  const useful = fresh.filter((w) => w.tier === "useful");
  const rare = fresh.filter((w) => w.tier === "rare");
  const candidates = [...useful.slice(0, MAX_USEFUL), ...rare.slice(0, MAX_RARE)].map((info, i) => ({ id: `w${i + 1}`, info }));

  const previousWarnings = ((lesson.analysisWarnings as string[] | null) ?? []).filter((w) =>
    /^(Ressource très longue|Vidéo très longue|Vidéo longue)/.test(w),
  );
  if (resource.transcriptSource === "AUTO_CAPTIONS") {
    previousWarnings.push("Texte issu des sous-titres automatiques de YouTube : il peut contenir des erreurs de reconnaissance.");
  } else if (resource.transcriptSource === "WHISPER") {
    previousWarnings.push("Texte transcrit automatiquement par Whisper : il peut contenir des erreurs de reconnaissance.");
  }
  const warnings: string[] = [...previousWarnings];
  if (resource.convertedFromTraditional) warnings.push("Texte converti du chinois traditionnel en simplifié.");
  if (useful.length > MAX_USEFUL || rare.length > MAX_RARE) {
    warnings.push(`Ressource riche : seuls les ${candidates.length} mots nouveaux les plus pertinents sont proposés.`);
  }

  let enrichment: ResourceEnrichment | null = null;
  if (mode === "auto" && candidates.length > 0) {
    const status = await getAIStatus();
    if (status.available) {
      const batches: (typeof candidates)[] = [];
      for (let i = 0; i < candidates.length; i += AI_BATCH) batches.push(candidates.slice(i, i + AI_BATCH));
      const results = await Promise.allSettled(
        batches.map((batch) =>
          enrichResourceWords({
            titleHint: lesson.titleChinese ?? lesson.title,
            kind: resource.kind,
            excerpt: resource.text.slice(0, AI_EXCERPT_CHARS),
            words: batch.map((c) => ({
              id: c.id,
              word: c.info.word,
              context: c.info.context,
            })),
          }),
        ),
      );
      const ok = results.filter((r): r is PromiseFulfilledResult<ResourceEnrichment> => r.status === "fulfilled").map((r) => r.value);
      const failed = results.find((r): r is PromiseRejectedResult => r.status === "rejected");
      if (ok.length) {
        enrichment = {
          ...ok[0],
          words: ok.flatMap((e) => e.words),
          expressions: ok.flatMap((e) => e.expressions).slice(0, 10),
        };
      }
      if (failed) {
        logError("resource:enrich", failed.reason, { lessonId });
        warnings.push(
          ok.length
            ? `Une partie des mots n'a pas pu être expliquée par l'IA (${aiErrorMessage(failed.reason)}) : sens anglais du dictionnaire HSK pour ceux-là.`
            : `${aiErrorMessage(failed.reason)} Sens anglais du dictionnaire HSK utilisés à la place (à compléter si besoin).`,
        );
      }
    } else {
      warnings.push(`IA non disponible (${status.reason ?? "non configurée"}) : sens anglais du dictionnaire HSK, sans traduction française.`);
    }
  }

  let items: VocabItem[];
  if (enrichment) {
    const applied = applyEnrichment(resource.text, candidates, enrichment, known, timeAt);
    items = applied.items;
    if (applied.ignored) warnings.push(`${applied.ignored} noms propres ou fragments ignorés par l'IA.`);
  } else {
    items = candidates.map((c) => baseItem(c.info, "pending", timeAt));
  }
  items = finalizeItems(items, user.hskLevel);
  const missingMeaning = items.filter((i) => !i.french && !i.english).length;
  if (missingMeaning) warnings.push(`${missingMeaning} mots sans sens connu : complète-les pour pouvoir les ajouter.`);

  const draft: Draft = {
    lesson: {
      title: enrichment?.title ?? lesson.title,
      titleChinese: enrichment?.titleChinese ?? lesson.titleChinese,
      date: null,
      topics: enrichment?.topics ?? [],
      summary: enrichment?.summary ?? null,
    },
    vocabulary: items,
    grammarPoints: [],
    sentences: [],
    corrections: [],
    exercises: [],
    warnings,
  };
  const current = await prisma.lesson.findUnique({
    where: { id: lessonId },
    select: { validatedAt: true },
  });
  await prisma.lesson.update({
    where: { id: lessonId },
    data: {
      processingStatus: "READY_FOR_REVIEW",
      extractionMethod: enrichment ? "AI" : "HEURISTIC",
      draft: json(draft),
      analysisWarnings: json(warnings),
      ...(current?.validatedAt
        ? {}
        : {
            title: draft.lesson.title,
            titleChinese: draft.lesson.titleChinese,
            topics: json(draft.lesson.topics),
          }),
    },
  });
}

// ─── Transcription Whisper (vidéo sans sous-titres) ───────────────────────────

const progressStore = globalThis as unknown as {
  __transcription?: Map<string, number>;
};
function progressMap() {
  if (!progressStore.__transcription) progressStore.__transcription = new Map();
  return progressStore.__transcription;
}

/** Progression de la transcription en cours (0 à 1), null si aucune. */
export function transcriptionProgress(lessonId: string): number | null {
  return progressMap().get(lessonId) ?? null;
}

async function transcribeVideo(lessonId: string, mediaId: string | null) {
  if (!mediaId) throw new ResourceError("Vidéo introuvable.");
  await prisma.lesson.update({
    where: { id: lessonId },
    data: { processingStatus: "EXTRACTING", analysisError: null },
  });
  const progress = progressMap();
  progress.set(lessonId, 0);
  try {
    const samples = await downloadAudio(mediaId, whisperMaxSeconds());
    if (samples.length < AUDIO_SAMPLE_RATE) throw new ResourceError("L'audio de cette vidéo est vide.");
    const timed = await transcribeLong(samples, (done) => {
      progress.set(lessonId, done);
      // Signe de vie : une transcription longue n'est pas une analyse interrompue.
      void prisma.lesson
        .update({
          where: { id: lessonId },
          data: { processingStatus: "EXTRACTING" },
        })
        .catch(() => undefined);
    });
    const normalized = await normalizeSegments(timed).catch((err) => {
      throw err instanceof ResourceError ? new ResourceError("Whisper n'a reconnu presque aucune parole en chinois dans cette vidéo.") : err;
    });
    return await prisma.resource.update({
      where: { lessonId },
      data: {
        text: segmentsText(normalized.segments),
        segments: json(normalized.segments),
        convertedFromTraditional: normalized.convertedFromTraditional,
      },
    });
  } finally {
    progress.delete(lessonId);
  }
}

// ─── Lecture ──────────────────────────────────────────────────────────────────

export interface ResourceSummary {
  lessonId: string;
  title: string;
  titleChinese: string | null;
  kind: ResourceKind;
  url: string | null;
  siteName: string | null;
  /** Vidéo YouTube : identifiant (miniature). */
  mediaId: string | null;
  status: string;
  createdAt: Date;
  coverage: number;
  wordsAdded: number;
  chars: number;
}

export async function listResources(): Promise<ResourceSummary[]> {
  const user = await getUser();
  const [resources, known] = await Promise.all([
    prisma.resource.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      include: {
        lesson: {
          select: {
            id: true,
            title: true,
            titleChinese: true,
            processingStatus: true,
            _count: { select: { knowledge: true } },
          },
        },
      },
    }),
    knownWords(user.id),
  ]);
  return resources.map((r) => ({
    lessonId: r.lesson.id,
    title: r.lesson.title,
    titleChinese: r.lesson.titleChinese,
    kind: r.kind,
    url: r.url,
    siteName: r.siteName,
    mediaId: r.mediaId,
    status: r.lesson.processingStatus,
    createdAt: r.createdAt,
    coverage: analyzeWithKnown(r.text, known, user.hskLevel).stats.coverage,
    wordsAdded: r.lesson._count.knowledge,
    chars: r.text.length,
  }));
}

export async function getResourceAnalysis(lessonId: string) {
  const user = await getUser();
  const resource = await prisma.resource.findUnique({ where: { lessonId } });
  if (!resource) return null;
  const known = await knownWords(user.id);
  return {
    resource,
    hskLevel: user.hskLevel,
    analysis: analyzeWithKnown(resource.text, known, user.hskLevel),
  };
}

// ─── Lecteur vidéo ────────────────────────────────────────────────────────────

/** Fiche d'un mot dans le lecteur : pinyin, sens (et d'où il vient), statut pour toi. */
export interface ReaderWord {
  pinyin: string | null;
  meaning: string | null;
  /** AI : proposé par l'IA pour cette ressource ; MINE : tes connaissances ; HSK : dictionnaire HSK (anglais). */
  meaningSource: "AI" | "USER" | "MINE" | "HSK" | null;
  hsk: number | null;
  status: "known" | "presumed" | "new";
}

export interface ReaderData {
  videoId: string;
  segments: { s: number; e: number; parts: SegmentPart[] }[];
  words: Record<string, ReaderWord>;
}

/** Données du lecteur interactif : répliques découpées en mots cliquables et fiche de chaque mot. */
export async function getReaderData(lessonId: string, draft: Draft | null): Promise<ReaderData | null> {
  const user = await getUser();
  const resource = await prisma.resource.findUnique({ where: { lessonId } });
  if (!resource?.mediaId || !Array.isArray(resource.segments) || !resource.text) return null;
  const segments = resource.segments as unknown as Segment[];
  const known = await knownWords(user.id);
  const hsk = hskDictionary();
  const tokens = tokenize(resource.text, {
    has: (w) => hsk.has(w) || known.has(w),
  });
  const unique = [...new Set(tokens.map((t) => t.word))];
  const mine = await prisma.vocabulary.findMany({
    where: { knowledgeItem: { userId: user.id }, hanzi: { in: unique } },
    select: { hanzi: true, pinyin: true, french: true, english: true },
  });
  const mineBy = new Map(mine.map((v) => [normalizeHanzi(v.hanzi), v]));
  const draftBy = new Map((draft?.vocabulary ?? []).map((v) => [normalizeHanzi(v.hanzi), v]));
  const words: Record<string, ReaderWord> = {};
  for (const w of unique) {
    const entry = hsk.get(w);
    const status: ReaderWord["status"] = known.has(w) ? "known" : entry && entry.level <= user.hskLevel ? "presumed" : "new";
    const own = mineBy.get(w);
    const d = draftBy.get(w);
    let meaning: string | null = null;
    let meaningSource: ReaderWord["meaningSource"] = null;
    if (own && (own.french || own.english)) {
      meaning = own.french || own.english;
      meaningSource = "MINE";
    } else if (d?.french) {
      meaning = d.french;
      meaningSource = d.frenchSource === "USER" ? "USER" : "AI";
    } else if (entry?.english) {
      meaning = entry.english;
      meaningSource = "HSK";
    }
    words[w] = {
      pinyin: own?.pinyin || d?.pinyin || entry?.pinyin || null,
      meaning,
      meaningSource,
      hsk: entry?.level ?? null,
      status,
    };
  }
  const parts = segmentParts(segments, tokens);
  return {
    videoId: resource.mediaId,
    segments: segments.map((seg, i) => ({
      s: seg.s,
      e: seg.e,
      parts: parts[i],
    })),
    words,
  };
}

// ─── Actions de tri ───────────────────────────────────────────────────────────

export async function setHskLevel(level: number): Promise<void> {
  if (!Number.isInteger(level) || level < 0 || level > 7) throw new ResourceError("Niveau invalide.");
  const userId = await getUserId();
  await prisma.user.update({
    where: { id: userId },
    data: { hskLevel: level },
  });
}

export async function setWordKnown(hanzi: string, known: boolean): Promise<void> {
  const word = normalizeHanzi(hanzi);
  if (!word || !containsHanzi(word)) throw new ResourceError("Mot invalide.");
  const userId = await getUserId();
  if (known) {
    await prisma.knownWord.upsert({
      where: { userId_hanzi: { userId, hanzi: word } },
      create: { userId, hanzi: word },
      update: {},
    });
  } else {
    await prisma.knownWord.deleteMany({ where: { userId, hanzi: word } });
  }
}

/** Prépare un mot choisi à la main dans le texte (pinyin et sens du dictionnaire HSK s'il y figure). */
export async function buildManualWord(lessonId: string, hanzi: string): Promise<VocabItem> {
  const word = hanzi.trim();
  if (!word || !containsHanzi(word) || [...word].length > 12) throw new ResourceError("Saisis un mot en caractères chinois.");
  const resource = await prisma.resource.findUnique({ where: { lessonId } });
  if (!resource) throw new ResourceError("Ressource introuvable.");
  const idx = resource.text.indexOf(word);
  const hsk = hskLookup(word) ?? null;
  const context = idx >= 0 ? contextAt(resource.text, idx, word) : "";
  const item = baseItem(
    {
      word,
      count: idx >= 0 ? countOccurrences(resource.text, word) : 0,
      status: "new",
      hsk,
      context,
      firstIndex: idx,
      tier: "useful",
      score: 0,
    },
    "approved",
    videoTimeAt(resource.segments),
  );
  item.edited = true;
  if (!context) {
    item.examples = [];
    item.sourceText = null;
  }
  return item;
}

export async function listKnownWords(): Promise<string[]> {
  const userId = await getUserId();
  return (
    await prisma.knownWord.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      select: { hanzi: true },
    })
  ).map((k) => k.hanzi);
}
