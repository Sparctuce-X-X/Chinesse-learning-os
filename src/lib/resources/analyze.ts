/**
 * Analyse d'une ressource externe (fonctions pures) :
 *  1. découpage du texte en mots (Intl.Segmenter, corrigé avec le dictionnaire) ;
 *  2. statut de chaque mot : connu (dans tes connaissances ou déclaré connu), supposé connu
 *     (niveau HSK ≤ ton niveau), ou nouveau ;
 *  3. taux de mots connus (adéquation de la ressource à ton niveau) ;
 *  4. tri des mots nouveaux : utiles (proposés) ou rares / avancés.
 */
import type { HskEntry } from "@/lib/chinese/hsk";

const HAN = /[㐀-䶿一-鿿豈-﫿]/;
const NUMERAL = /^[零〇一二三四五六七八九十百千万亿两几第]+$/;
/** Particules souvent collées à un mot par le découpage automatique (ex. « 人的 »). */
const PARTICLES = new Set(["的", "了", "着", "过", "们", "地", "得", "吗", "呢", "吧", "啊", "呀", "嘛", "也", "都", "就", "还", "很", "在", "是", "和", "把", "被", "给"]);
const MAX_WORD = 6;

export interface Dictionary {
  has(word: string): boolean;
}

function segments(text: string): { segment: string; index: number; isWordLike: boolean }[] {
  const Seg = (Intl as unknown as { Segmenter?: typeof Intl.Segmenter }).Segmenter;
  if (!Seg) return [...text].map((c, i) => ({ segment: c, index: i, isWordLike: HAN.test(c) }));
  const out: { segment: string; index: number; isWordLike: boolean }[] = [];
  for (const s of new Seg("zh", { granularity: "word" }).segment(text)) {
    out.push({ segment: s.segment, index: s.index, isWordLike: !!s.isWordLike });
  }
  return out;
}

export interface Token {
  word: string;
  index: number;
}

/**
 * Découpe un texte chinois en mots. Le découpage ICU est corrigé :
 * - segments adjacents fusionnés s'ils forment un mot connu du dictionnaire (ex. 时 + 薪 → 时薪) ;
 * - particule collée détachée si le reste est un mot connu (ex. 人的 → 人 + 的).
 */
export function tokenize(text: string, dict: Dictionary): Token[] {
  const segs = segments(text).filter((s) => s.isWordLike && HAN.test(s.segment));
  const out: Token[] = [];
  let i = 0;
  while (i < segs.length) {
    // Fusion : la plus longue suite de segments contigus qui forme un mot du dictionnaire.
    let merged = 1;
    let word = segs[i].segment;
    let concat = word;
    for (let j = i + 1; j < segs.length && j < i + 4; j++) {
      if (segs[j].index !== segs[j - 1].index + segs[j - 1].segment.length) break;
      concat += segs[j].segment;
      if ([...concat].length > MAX_WORD) break;
      if (dict.has(concat)) {
        merged = j - i + 1;
        word = concat;
      }
    }
    if (merged > 1) {
      out.push({ word, index: segs[i].index });
      i += merged;
      continue;
    }
    // Détachement d'une particule en tête ou en fin de segment inconnu.
    const chars = [...word];
    if (!dict.has(word) && chars.length >= 2) {
      const last = chars[chars.length - 1];
      const first = chars[0];
      const head = chars.slice(0, -1).join("");
      const tail = chars.slice(1).join("");
      if (PARTICLES.has(last) && dict.has(head)) {
        out.push({ word: head, index: segs[i].index }, { word: last, index: segs[i].index + head.length });
        i++;
        continue;
      }
      if (PARTICLES.has(first) && dict.has(tail)) {
        out.push({ word: first, index: segs[i].index }, { word: tail, index: segs[i].index + first.length });
        i++;
        continue;
      }
    }
    out.push({ word, index: segs[i].index });
    i++;
  }
  return out;
}

/** Phrase du texte qui contient la position donnée (raccourcie autour du mot si elle est longue). */
export function contextAt(text: string, index: number, word: string, maxLength = 70): string {
  const isEnd = (c: string) => /[。！？!?；;\n]/.test(c);
  let start = index;
  while (start > 0 && !isEnd(text[start - 1])) start--;
  let end = index + word.length;
  while (end < text.length && !isEnd(text[end])) end++;
  if (end < text.length && !/\n/.test(text[end])) end++;
  let sentence = text.slice(start, end).trim();
  if (sentence.length > maxLength) {
    const rel = index - start;
    const from = Math.max(0, Math.min(rel - Math.floor((maxLength - word.length) / 2), sentence.length - maxLength));
    sentence = (from > 0 ? "…" : "") + sentence.slice(from, from + maxLength).trim() + (from + maxLength < sentence.length ? "…" : "");
  }
  return sentence.replace(/\s+/g, " ");
}

export type WordStatus = "known" | "presumed" | "new";
export type WordTier = "useful" | "rare";

export interface WordInfo {
  word: string;
  count: number;
  status: WordStatus;
  hsk: HskEntry | null;
  /** Première phrase du texte où le mot apparaît. */
  context: string;
  firstIndex: number;
  tier: WordTier | null;
  score: number;
}

export interface CoverageStats {
  /** Nombre de mots (occurrences) en caractères chinois, hors nombres. */
  tokens: number;
  known: number;
  presumed: number;
  unknown: number;
  uniqueWords: number;
  /** Pourcentage d'occurrences connues ou supposées connues (0–100). */
  coverage: number;
  /** Pourcentage d'occurrences dans tes propres connaissances (0–100). */
  coverageOwn: number;
}

export interface TextAnalysis {
  stats: CoverageStats;
  words: WordInfo[];
}

export interface AnalyzeOptions {
  /** Mots de tes connaissances + mots déclarés connus (hanzi normalisés). */
  known: Set<string>;
  hskLevel: number;
  lookup: (word: string) => HskEntry | undefined;
}

/** Utile = fréquent dans le texte ou dans la langue, proche de ton niveau. */
function scoreWord(w: Pick<WordInfo, "count" | "hsk">, hskLevel: number): number {
  let s = Math.min(5, w.count) * 2;
  if (w.hsk) {
    s += Math.max(0, 8 - w.hsk.level) * 0.5;
    s += w.hsk.frequency < 5000 ? 1.5 : w.hsk.frequency < 15000 ? 0.5 : 0;
    if (w.hsk.level > hskLevel + 2) s -= 1;
  }
  return Math.round(s * 100) / 100;
}

function tierOf(w: Pick<WordInfo, "count" | "hsk">, hskLevel: number): WordTier {
  if (w.count >= 2) return "useful";
  if (!w.hsk) return "rare";
  // Mot avancé et peu fréquent dans la langue : rare (un mot avancé mais courant reste utile).
  if (w.hsk.level > hskLevel + 2 && w.hsk.frequency > 5000) return "rare";
  return "useful";
}

/**
 * Mot hors liste HSK formé uniquement de caractères que tu connais déjà comme mots
 * (ex. 这个 = 这 + 个, 死掉 = 死 + 掉) : son sens se devine, il n'est pas proposé.
 */
function isTransparent(word: string, opts: AnalyzeOptions): boolean {
  const chars = [...word];
  if (chars.length < 2 || chars.length > 3) return false;
  return chars.every((c) => {
    if (opts.known.has(c)) return true;
    const e = opts.lookup(c);
    return !!e && e.level <= opts.hskLevel;
  });
}

export function analyzeText(text: string, tokens: Token[], opts: AnalyzeOptions): TextAnalysis {
  const words = new Map<string, WordInfo>();
  const stats: CoverageStats = { tokens: 0, known: 0, presumed: 0, unknown: 0, uniqueWords: 0, coverage: 0, coverageOwn: 0 };
  for (const t of tokens) {
    if (NUMERAL.test(t.word)) continue;
    stats.tokens++;
    let info = words.get(t.word);
    if (!info) {
      const hsk = opts.lookup(t.word) ?? null;
      const status: WordStatus = opts.known.has(t.word)
        ? "known"
        : (hsk && hsk.level <= opts.hskLevel) || (!hsk && isTransparent(t.word, opts))
          ? "presumed"
          : "new";
      info = { word: t.word, count: 0, status, hsk, context: contextAt(text, t.index, t.word), firstIndex: t.index, tier: null, score: 0 };
      words.set(t.word, info);
    }
    info.count++;
    if (info.status === "known") stats.known++;
    else if (info.status === "presumed") stats.presumed++;
    else stats.unknown++;
  }
  for (const w of words.values()) {
    if (w.status !== "new") continue;
    w.tier = tierOf(w, opts.hskLevel);
    w.score = scoreWord(w, opts.hskLevel);
  }
  stats.uniqueWords = words.size;
  stats.coverage = stats.tokens ? Math.round(((stats.known + stats.presumed) / stats.tokens) * 100) : 0;
  stats.coverageOwn = stats.tokens ? Math.round((stats.known / stats.tokens) * 100) : 0;
  const sorted = [...words.values()].sort((a, b) => b.score - a.score || b.count - a.count || a.firstIndex - b.firstIndex);
  return { stats, words: sorted };
}

/** Appréciation du taux de mots connus (zone idéale : 90–95 %). */
export function coverageVerdict(coverage: number): { label: string; tone: "hard" | "good" | "easy" } {
  if (coverage < 80) return { label: "Difficile : beaucoup de mots inconnus", tone: "hard" };
  if (coverage < 90) return { label: "Exigeant mais faisable", tone: "hard" };
  if (coverage <= 97) return { label: "Idéal pour progresser", tone: "good" };
  return { label: "Facile : peu de mots nouveaux", tone: "easy" };
}
