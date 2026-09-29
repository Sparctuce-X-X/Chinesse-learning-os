import "server-only";
import { readFile, unlink } from "node:fs/promises";
import type { Prisma, SourceType } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { extractPdf, PdfExtractionError } from "@/lib/pdf/extract";
import { heuristicExtract } from "@/lib/pdf/heuristic";
import { getAIStatus } from "@/lib/ai";
import { analyzeLesson } from "@/lib/ai/tasks";
import { aiErrorMessage } from "@/lib/ai/types";
import { DraftSchema, LessonExtractionSchema, type Draft, type DraftSection } from "@/lib/ai/schemas";
import { extractionToDraft, sameVocabulary } from "@/lib/lessons/draft";
import { canonicalKey, normalizeHanzi } from "@/lib/chinese/text";
import { logError } from "@/lib/log";
import { absoluteStoragePath, saveFile, sha256 } from "./storage";
import { getUserId } from "./user";

export const MAX_PDF_BYTES = 40 * 1024 * 1024;

export class LessonError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LessonError";
  }
}

const json = (v: unknown) => v as Prisma.InputJsonValue;

// ─── Import ───────────────────────────────────────────────────────────────────

export interface ImportResult {
  lessonId: string;
  duplicateOf: { lessonId: string; title: string } | null;
}

/**
 * Importe un PDF : copie interne, extraction du texte page par page, puis analyse
 * (IA si disponible, sinon heuristique) lancée en arrière-plan.
 * Le PDF est conservé même si l'extraction ou l'analyse échoue.
 */
export async function importPdf(filename: string, data: Uint8Array, opts: { analyze?: boolean } = {}): Promise<ImportResult> {
  if (data.byteLength === 0) throw new LessonError("Le fichier est vide.");
  if (data.byteLength > MAX_PDF_BYTES) throw new LessonError("Le fichier dépasse 40 Mo.");
  const userId = await getUserId();
  const hash = sha256(data);
  const existing = await prisma.sourceDocument.findFirst({
    where: { sha256: hash },
    include: { lesson: { select: { id: true, title: true } } },
  });

  const cleanName = filename.replace(/[/\\]/g, "_").slice(0, 200) || "cours.pdf";
  const lesson = await prisma.lesson.create({
    data: {
      userId,
      title: cleanName.replace(/\.pdf$/i, ""),
      date: new Date(),
      topics: json([]),
      analysisWarnings: json([]),
      processingStatus: "EXTRACTING",
    },
  });
  const storagePath = await saveFile("uploads", `${lesson.id}.pdf`, data);
  const doc = await prisma.sourceDocument.create({
    data: {
      lessonId: lesson.id,
      filename: cleanName,
      mimeType: "application/pdf",
      sizeBytes: data.byteLength,
      sha256: hash,
      storagePath,
      imagePages: json([]),
    },
  });

  try {
    const ex = await extractPdf(data);
    await prisma.$transaction([
      prisma.sourcePage.createMany({
        data: ex.pages.map((p) => ({
          documentId: doc.id,
          pageNumber: p.pageNumber,
          text: p.text,
          charCount: p.charCount,
          likelyImage: p.likelyImage,
        })),
      }),
      prisma.sourceDocument.update({
        where: { id: doc.id },
        data: {
          pageCount: ex.pageCount,
          extractedText: ex.fullText,
          imagePages: json(ex.imagePages),
          pdfCreatedAt: ex.pdfCreatedAt,
          processingStatus: "EXTRACTED",
        },
      }),
      prisma.lesson.update({
        where: { id: lesson.id },
        data: { processingStatus: "ANALYZING", date: ex.pdfCreatedAt ?? new Date() },
      }),
    ]);
  } catch (err) {
    const message = err instanceof PdfExtractionError ? err.message : "Échec de la lecture du PDF.";
    logError("pdf:extract", err, { lessonId: lesson.id });
    await prisma.$transaction([
      prisma.sourceDocument.update({ where: { id: doc.id }, data: { processingStatus: "FAILED", errorMessage: message } }),
      prisma.lesson.update({ where: { id: lesson.id }, data: { processingStatus: "FAILED", analysisError: message } }),
    ]);
    return { lessonId: lesson.id, duplicateOf: existing ? { lessonId: existing.lesson.id, title: existing.lesson.title } : null };
  }

  if (opts.analyze !== false) startAnalysis(lesson.id);
  return { lessonId: lesson.id, duplicateOf: existing ? { lessonId: existing.lesson.id, title: existing.lesson.title } : null };
}

// ─── Analyse ──────────────────────────────────────────────────────────────────

const running = globalThis as unknown as { __analyses?: Map<string, Promise<void>> };
function runningMap() {
  if (!running.__analyses) running.__analyses = new Map();
  return running.__analyses;
}

export function isAnalysisRunning(lessonId: string): boolean {
  return runningMap().has(lessonId);
}

/** Lance l'analyse en arrière-plan (idempotent). */
export function startAnalysis(lessonId: string, mode: "auto" | "heuristic" = "auto"): Promise<void> {
  const map = runningMap();
  const current = map.get(lessonId);
  if (current) return current;
  const p = runAnalysis(lessonId, mode)
    .catch((err) => logError("lesson:analysis", err, { lessonId }))
    .finally(() => map.delete(lessonId));
  map.set(lessonId, p);
  return p;
}

export async function runAnalysis(lessonId: string, mode: "auto" | "heuristic" = "auto"): Promise<void> {
  const lesson = await prisma.lesson.findUnique({
    where: { id: lessonId },
    include: { documents: { include: { pages: { orderBy: { pageNumber: "asc" } } } } },
  });
  if (!lesson) throw new LessonError("Cours introuvable.");
  if (lesson.kind === "RESOURCE") {
    // Import dynamique : resources.ts dépend lui-même de ce module.
    const { runResourceAnalysis } = await import("./resources");
    try {
      return await runResourceAnalysis(lessonId, mode);
    } catch (err) {
      await prisma.lesson.update({
        where: { id: lessonId },
        data: { processingStatus: "FAILED", analysisError: err instanceof Error ? err.message : "L'analyse de la ressource a échoué." },
      });
      throw err;
    }
  }
  const doc = lesson.documents[0];
  if (!doc || doc.processingStatus !== "EXTRACTED") {
    await prisma.lesson.update({
      where: { id: lessonId },
      data: { processingStatus: "FAILED", analysisError: "Le texte du PDF n'a pas pu être extrait." },
    });
    return;
  }
  await prisma.lesson.update({ where: { id: lessonId }, data: { processingStatus: "ANALYZING", analysisError: null } });

  const pages = doc.pages.map((p) => ({ pageNumber: p.pageNumber, text: p.text, likelyImage: p.likelyImage }));
  const warnings: string[] = [];
  let extraction = null;
  let method: "AI" | "HEURISTIC" = "HEURISTIC";

  if (mode === "auto") {
    const status = await getAIStatus();
    if (status.available) {
      try {
        extraction = await analyzeLesson({
          filename: doc.filename,
          pdfPath: absoluteStoragePath(doc.storagePath),
          pages,
          pdfCreatedAt: doc.pdfCreatedAt,
        });
        method = "AI";
      } catch (err) {
        warnings.push(`${aiErrorMessage(err)} Extraction simple utilisée à la place.`);
      }
    } else {
      warnings.push(`IA non disponible (${status.reason ?? "non configurée"}). Extraction simple utilisée.`);
    }
  }
  if (!extraction) {
    extraction = LessonExtractionSchema.parse(
      heuristicExtract({ filename: doc.filename, pages, pdfCreatedAt: doc.pdfCreatedAt }),
    );
  }

  const draft = extractionToDraft(extraction);
  draft.warnings = [...warnings, ...draft.warnings];
  await markDuplicates(lesson.userId, draft);

  const date = extraction.lesson.date ? new Date(`${extraction.lesson.date}T12:00:00`) : lesson.date;
  await prisma.lesson.update({
    where: { id: lessonId },
    data: {
      processingStatus: "READY_FOR_REVIEW",
      extractionMethod: method,
      draft: json(draft),
      analysisWarnings: json(draft.warnings),
      title: lesson.validatedAt ? lesson.title : extraction.lesson.title,
      titleChinese: lesson.validatedAt ? lesson.titleChinese : extraction.lesson.titleChinese,
      topics: json(extraction.lesson.topics),
      date: lesson.validatedAt ? lesson.date : date,
    },
  });
}

/** Signale les éléments déjà présents dans la base personnelle. */
export async function markDuplicates(userId: string, draft: Draft): Promise<void> {
  const vocabKeys = draft.vocabulary.map((v) => canonicalKey("VOCABULARY", v.hanzi));
  const sentenceKeys = draft.sentences.map((s) => canonicalKey("SENTENCE", s.hanzi));
  const grammarKeys = draft.grammarPoints.map((g) => canonicalKey("GRAMMAR", g.name));
  const existing = await prisma.knowledgeItem.findMany({
    where: {
      userId,
      OR: [
        { canonicalKey: { in: vocabKeys } },
        { canonicalKey: { in: vocabKeys.map((k) => k.replace("VOCABULARY:", "EXPRESSION:")) } },
        { canonicalKey: { in: sentenceKeys } },
        { canonicalKey: { in: grammarKeys } },
      ],
    },
    include: { vocabulary: true, sentence: true, grammarPoint: true },
  });

  for (const v of draft.vocabulary) {
    const key = normalizeHanzi(v.hanzi);
    const candidates = existing.filter((e) => e.vocabulary && normalizeHanzi(e.vocabulary.hanzi) === key);
    const same = candidates.find((c) => sameVocabulary(v, { hanzi: c.vocabulary!.hanzi, pinyin: c.vocabulary!.pinyin }));
    const match = same ?? candidates[0];
    v.duplicate = match
      ? {
          knowledgeItemId: match.id,
          label: `${match.vocabulary!.hanzi} ${match.vocabulary!.pinyin ?? ""} — ${match.vocabulary!.french ?? match.vocabulary!.english ?? ""}`.trim(),
          action: same ? "merge" : "new",
        }
      : null;
  }
  for (const s of draft.sentences) {
    const match = existing.find((e) => e.canonicalKey === canonicalKey("SENTENCE", s.hanzi));
    s.duplicate = match ? { knowledgeItemId: match.id, label: match.sentence?.hanzi ?? s.hanzi, action: "merge" } : null;
  }
  for (const g of draft.grammarPoints) {
    const match = existing.find((e) => e.canonicalKey === canonicalKey("GRAMMAR", g.name));
    g.duplicate = match ? { knowledgeItemId: match.id, label: match.grammarPoint?.name ?? g.name, action: "merge" } : null;
  }
}

// ─── Brouillon ────────────────────────────────────────────────────────────────

export async function getDraft(lessonId: string): Promise<Draft | null> {
  const lesson = await prisma.lesson.findUnique({ where: { id: lessonId }, select: { draft: true } });
  if (!lesson?.draft) return null;
  const parsed = DraftSchema.safeParse(lesson.draft);
  return parsed.success ? parsed.data : null;
}

export async function saveDraft(lessonId: string, draft: unknown): Promise<Draft> {
  const parsed = DraftSchema.safeParse(draft);
  if (!parsed.success) throw new LessonError("Brouillon invalide : " + (parsed.error.issues[0]?.message ?? ""));
  const lesson = await prisma.lesson.findUnique({ where: { id: lessonId } });
  if (!lesson) throw new LessonError("Cours introuvable.");
  if (lesson.processingStatus !== "READY_FOR_REVIEW") throw new LessonError("Ce cours n'est pas en attente de validation.");
  await prisma.lesson.update({ where: { id: lessonId }, data: { draft: json(parsed.data) } });
  return parsed.data;
}

// ─── Validation ───────────────────────────────────────────────────────────────

const EXERCISE_TYPE_MAP = {
  DISCUSSION: "SPEAKING",
  COMPREHENSION: "SPEAKING",
  FILL_BLANK: "FILL_BLANK",
  TRANSLATION: "TRANSLATION",
  OTHER: "SPEAKING",
} as const;

type Tx = Prisma.TransactionClient;

async function linkLesson(
  tx: Tx,
  lessonId: string,
  knowledgeItemId: string,
  data: { sourcePage: number | null; sourceText: string | null; confidence: "HIGH" | "MEDIUM" | "LOW"; highlighted?: boolean },
) {
  await tx.lessonKnowledge.upsert({
    where: { lessonId_knowledgeItemId: { lessonId, knowledgeItemId } },
    create: { lessonId, knowledgeItemId, ...data, highlighted: data.highlighted ?? false },
    update: { ...data, highlighted: data.highlighted ?? false },
  });
}

async function addExamples(
  tx: Tx,
  knowledgeItemId: string,
  lessonId: string,
  sourcePage: number | null,
  examples: {
    hanzi: string;
    pinyin: string | null;
    french: string | null;
    english: string | null;
    source: SourceType;
    translationSource: SourceType | null;
  }[],
) {
  if (!examples.length) return;
  const existing = await tx.example.findMany({ where: { knowledgeItemId }, select: { hanzi: true } });
  const known = new Set(existing.map((e) => normalizeHanzi(e.hanzi)));
  for (const ex of examples) {
    const k = normalizeHanzi(ex.hanzi);
    if (!k || known.has(k)) continue;
    known.add(k);
    await tx.example.create({
      data: {
        knowledgeItemId,
        lessonId,
        hanzi: ex.hanzi,
        pinyin: ex.pinyin,
        french: ex.french,
        english: ex.english,
        sourceType: ex.source,
        // Sans indication, une traduction n'est jamais attribuée à la professeure.
        translationSource: ex.french || ex.english ? (ex.translationSource ?? (ex.source === "TEACHER" ? "AI" : ex.source)) : null,
        sourcePage,
      },
    });
  }
}

/** Remplit uniquement les champs vides d'une connaissance existante (jamais d'écrasement). */
function fillMissing<T extends Record<string, unknown>>(current: T, incoming: Partial<T>): Partial<T> {
  const patch: Partial<T> = {};
  for (const [k, v] of Object.entries(incoming)) {
    if (v !== null && v !== undefined && (current[k] === null || current[k] === undefined || current[k] === "")) {
      (patch as Record<string, unknown>)[k] = v;
    }
  }
  return patch;
}

export interface ValidateInput {
  title: string;
  titleChinese?: string | null;
  date: string; // YYYY-MM-DD
  notes?: string | null;
  topics?: string[];
}

export interface ValidationSummary {
  created: number;
  merged: number;
  corrections: number;
  exercises: number;
}

export async function validateLesson(lessonId: string, input: ValidateInput): Promise<ValidationSummary> {
  const lesson = await prisma.lesson.findUnique({ where: { id: lessonId } });
  if (!lesson) throw new LessonError("Cours introuvable.");
  if (lesson.processingStatus !== "READY_FOR_REVIEW") throw new LessonError("Ce cours n'est pas en attente de validation.");
  const draft = await getDraft(lessonId);
  if (!draft) throw new LessonError("Aucun brouillon à valider.");
  if (!input.title.trim()) throw new LessonError("Le titre est obligatoire.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) throw new LessonError("Date invalide.");

  const approved = <S extends DraftSection>(s: S) =>
    (draft[s] as Draft[S]).filter((i) => i.decision === "approved") as Draft[S];
  const userId = lesson.userId;
  // Ressource externe : rien n'est attribué à la professeure (texte « EXTERNAL », traductions « AI »).
  const isResource = lesson.kind === "RESOURCE";
  const origin: SourceType = isResource ? "EXTERNAL" : "TEACHER";
  const safe = (src: SourceType | null | undefined, fallback: SourceType): SourceType =>
    isResource && (src === "TEACHER" || !src) ? fallback : (src ?? fallback);
  const summary: ValidationSummary = { created: 0, merged: 0, corrections: 0, exercises: 0 };

  await prisma.$transaction(
    async (tx) => {
      // Vocabulaire / expressions
      for (const v of approved("vocabulary")) {
        const type = v.kind;
        const key = canonicalKey(type, v.hanzi);
        let itemId: string | null = null;
        if (v.duplicate?.action === "merge") {
          const exists = await tx.knowledgeItem.findUnique({ where: { id: v.duplicate.knowledgeItemId }, include: { vocabulary: true } });
          if (exists?.vocabulary) {
            itemId = exists.id;
            const patch = fillMissing(exists.vocabulary, {
              pinyin: v.pinyin,
              pinyinSource: v.pinyin ? (isResource ? safe(v.pinyinSource, "AI") : v.pinyinSource) : null,
              french: v.french,
              frenchSource: v.french ? (isResource ? safe(v.frenchSource, "AI") : v.frenchSource) : null,
              english: v.english,
              englishSource: v.english ? (isResource ? safe(v.englishSource, "EXTERNAL") : v.englishSource) : null,
              partOfSpeech: v.partOfSpeech,
            });
            if (Object.keys(patch).length) await tx.vocabulary.update({ where: { knowledgeItemId: itemId }, data: patch });
            summary.merged++;
          }
        }
        if (!itemId) {
          const created = await tx.knowledgeItem.create({
            data: {
              userId,
              type,
              sourceType: v.edited && !v.sourceText ? "USER" : origin,
              canonicalKey: key,
              vocabulary: {
                create: {
                  hanzi: v.hanzi.trim(),
                  pinyin: v.pinyin,
                  pinyinSource: v.pinyin ? safe(v.pinyinSource, "AI") : null,
                  french: v.french,
                  frenchSource: v.french ? safe(v.frenchSource, "AI") : null,
                  english: v.english,
                  englishSource: v.english ? safe(v.englishSource, origin) : null,
                  partOfSpeech: v.partOfSpeech,
                  notes: v.notes,
                },
              },
              reviewState: { create: {} },
            },
          });
          itemId = created.id;
          summary.created++;
        }
        await linkLesson(tx, lessonId, itemId, {
          sourcePage: v.sourcePage,
          sourceText: v.sourceText,
          confidence: v.confidence,
          highlighted: v.highlighted,
        });
        await addExamples(
          tx,
          itemId,
          lessonId,
          v.sourcePage,
          isResource ? v.examples.map((e) => ({ ...e, source: safe(e.source, "EXTERNAL"), translationSource: e.french || e.english ? safe(e.translationSource, "AI") : null })) : v.examples,
        );
      }

      // Grammaire
      for (const g of approved("grammarPoints")) {
        let itemId: string | null = null;
        if (g.duplicate?.action === "merge") {
          const exists = await tx.knowledgeItem.findUnique({ where: { id: g.duplicate.knowledgeItemId }, include: { grammarPoint: true } });
          if (exists?.grammarPoint) {
            itemId = exists.id;
            const patch = fillMissing(exists.grammarPoint, {
              structure: g.structure,
              explanation: g.explanation,
              explanationSource: g.explanation ? g.explanationSource : null,
            });
            if (Object.keys(patch).length) await tx.grammarPoint.update({ where: { knowledgeItemId: itemId }, data: patch });
            summary.merged++;
          }
        }
        if (!itemId) {
          const created = await tx.knowledgeItem.create({
            data: {
              userId,
              type: "GRAMMAR",
              sourceType: g.edited && !g.sourceText ? "USER" : "TEACHER",
              canonicalKey: canonicalKey("GRAMMAR", g.name),
              grammarPoint: {
                create: {
                  name: g.name.trim(),
                  structure: g.structure,
                  explanation: g.explanation,
                  explanationSource: g.explanation ? g.explanationSource ?? "AI" : null,
                  french: g.french,
                  frenchSource: g.french ? g.frenchSource ?? "AI" : null,
                },
              },
              reviewState: { create: {} },
            },
          });
          itemId = created.id;
          summary.created++;
        }
        await linkLesson(tx, lessonId, itemId, { sourcePage: g.sourcePage, sourceText: g.sourceText, confidence: g.confidence });
        await addExamples(tx, itemId, lessonId, g.sourcePage, g.examples);
      }

      // Phrases
      const createSentence = async (s: {
        hanzi: string;
        pinyin: string | null;
        pinyinSource: SourceType | null;
        french: string | null;
        frenchSource: SourceType | null;
        english: string | null;
        englishSource: SourceType | null;
        sourceType: SourceType;
        notes: string | null;
      }) => {
        const key = canonicalKey("SENTENCE", s.hanzi);
        const exists = await tx.knowledgeItem.findFirst({ where: { userId, canonicalKey: key }, include: { sentence: true } });
        if (exists?.sentence) {
          const patch = fillMissing(exists.sentence, {
            pinyin: s.pinyin,
            pinyinSource: s.pinyin ? s.pinyinSource : null,
            french: s.french,
            frenchSource: s.french ? s.frenchSource : null,
            english: s.english,
            englishSource: s.english ? s.englishSource : null,
          });
          if (Object.keys(patch).length) await tx.sentence.update({ where: { knowledgeItemId: exists.id }, data: patch });
          summary.merged++;
          return exists.id;
        }
        const created = await tx.knowledgeItem.create({
          data: {
            userId,
            type: "SENTENCE",
            sourceType: s.sourceType,
            canonicalKey: key,
            sentence: {
              create: {
                hanzi: s.hanzi.trim(),
                pinyin: s.pinyin,
                pinyinSource: s.pinyin ? s.pinyinSource ?? "AI" : null,
                french: s.french,
                frenchSource: s.french ? s.frenchSource ?? "AI" : null,
                english: s.english,
                englishSource: s.english ? s.englishSource ?? "TEACHER" : null,
                notes: s.notes,
              },
            },
            reviewState: { create: {} },
          },
        });
        summary.created++;
        return created.id;
      };

      for (const s of approved("sentences")) {
        const itemId = await createSentence({
          ...s,
          sourceType: s.origin === "STUDENT_PRACTICE" ? "USER" : s.edited && !s.sourcePage ? "USER" : "TEACHER",
          notes: s.origin === "STUDENT_PRACTICE" ? "Phrase produite par l'élève pendant le cours." : null,
        });
        await linkLesson(tx, lessonId, itemId, { sourcePage: s.sourcePage, sourceText: s.hanzi, confidence: s.confidence });
      }

      // Corrections → correction + phrase correcte à réviser
      for (const c of approved("corrections")) {
        const itemId = await createSentence({
          hanzi: c.correct,
          pinyin: null,
          pinyinSource: null,
          french: null,
          frenchSource: null,
          english: null,
          englishSource: null,
          sourceType: "TEACHER",
          notes: `Correction de : ${c.incorrect}`,
        });
        await tx.teacherCorrection.create({
          data: {
            lessonId,
            knowledgeItemId: itemId,
            incorrect: c.incorrect,
            correct: c.correct,
            explanation: c.explanation,
            context: c.context,
            sourcePage: c.sourcePage,
            sourceType: c.edited ? "USER" : "TEACHER",
          },
        });
        await linkLesson(tx, lessonId, itemId, { sourcePage: c.sourcePage, sourceText: c.correct, confidence: c.confidence });
        summary.corrections++;
      }

      // Exercices du PDF (conservés pour la fiche du cours et l'oral)
      await tx.exercise.deleteMany({ where: { lessonId, sourceType: { in: ["TEACHER", "USER"] }, knowledgeItemId: null } });
      for (const e of approved("exercises")) {
        await tx.exercise.create({
          data: {
            lessonId,
            type: EXERCISE_TYPE_MAP[e.type],
            prompt: e.prompt,
            expectedAnswer: e.answer,
            metadata: json({ pdfType: e.type, context: e.context }),
            sourceType: e.edited ? "USER" : "TEACHER",
            sourcePage: e.sourcePage,
          },
        });
        summary.exercises++;
      }

      await tx.lesson.update({
        where: { id: lessonId },
        data: {
          title: input.title.trim(),
          titleChinese: input.titleChinese?.trim() || null,
          date: new Date(`${input.date}T12:00:00`),
          notes: input.notes?.trim() || null,
          topics: json(input.topics ?? draft.lesson.topics),
          processingStatus: "VALIDATED",
          validatedAt: new Date(),
          draft: json(draft),
        },
      });
    },
    { timeout: 60_000 },
  );
  return summary;
}

/** Marque comme échouées les analyses interrompues (ex. redémarrage du serveur). */
export async function recoverStaleAnalyses(): Promise<void> {
  const stale = await prisma.lesson.findMany({
    where: { processingStatus: { in: ["ANALYZING", "EXTRACTING"] }, updatedAt: { lt: new Date(Date.now() - 15 * 60_000) } },
    select: { id: true },
  });
  for (const l of stale) {
    if (isAnalysisRunning(l.id)) continue;
    await prisma.lesson.update({
      where: { id: l.id },
      data: { processingStatus: "FAILED", analysisError: "L'analyse a été interrompue. Relance-la." },
    });
  }
}

export async function readLessonPdf(lessonId: string): Promise<{ filename: string; data: Buffer } | null> {
  const doc = await prisma.sourceDocument.findFirst({ where: { lessonId } });
  if (!doc) return null;
  try {
    return { filename: doc.filename, data: await readFile(absoluteStoragePath(doc.storagePath)) };
  } catch {
    return null;
  }
}

/** Abandon d'un import non validé (le cours et sa copie interne du PDF sont supprimés). */
export async function discardImport(lessonId: string): Promise<void> {
  const lesson = await prisma.lesson.findUnique({ where: { id: lessonId }, include: { documents: true } });
  if (!lesson) return;
  if (lesson.processingStatus === "VALIDATED") throw new LessonError("Un cours validé ne peut pas être abandonné.");
  if (isAnalysisRunning(lessonId)) throw new LessonError("L'analyse est en cours : attends qu'elle se termine.");
  await prisma.lesson.delete({ where: { id: lessonId } });
  // Seule la copie interne est supprimée (jamais le fichier d'origine).
  for (const d of lesson.documents) {
    if (d.storagePath.startsWith("uploads/")) await unlink(absoluteStoragePath(d.storagePath)).catch(() => undefined);
  }
}
