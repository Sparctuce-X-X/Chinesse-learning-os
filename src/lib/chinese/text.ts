/** Outils texte chinois / français. */

const HAN_RE = /[㐀-䶿一-鿿豈-﫿]/;
const HAN_RE_G = /[㐀-䶿一-鿿豈-﫿]/g;

export function containsHanzi(s: string): boolean {
  return HAN_RE.test(s);
}

export function countHanzi(s: string): number {
  return (s.match(HAN_RE_G) ?? []).length;
}

/** Ne garde que les caractères chinois (et chiffres) — pour comparer deux réponses. */
export function normalizeHanzi(s: string): string {
  return s
    .normalize("NFKC")
    .replace(/[\s　]/g, "")
    .replace(/[，。！？、；：“”‘’「」『』（）《》〈〉…—·,.!?;:'"()[\]{}<>~\-_/\\]/g, "");
}

/** Distance de Levenshtein sur points de code (tolère les caractères hors BMP). */
export function levenshtein(a: string, b: string): number {
  const x = [...a];
  const y = [...b];
  if (x.length === 0) return y.length;
  if (y.length === 0) return x.length;
  let prev = Array.from({ length: y.length + 1 }, (_, i) => i);
  for (let i = 1; i <= x.length; i++) {
    const cur = [i];
    for (let j = 1; j <= y.length; j++) {
      cur[j] = Math.min(
        prev[j] + 1,
        cur[j - 1] + 1,
        prev[j - 1] + (x[i - 1] === y[j - 1] ? 0 : 1),
      );
    }
    prev = cur;
  }
  return prev[y.length];
}

const FR_STOPWORDS = new Set([
  "le", "la", "les", "l", "un", "une", "des", "du", "de", "d", "se", "s", "to", "a",
  "an", "the", "etre", "faire", "quelque", "chose", "qqch", "qqn", "sth", "sb",
]);

/** Normalise une glose (fr/en) : minuscules, sans accents, sans ponctuation ni articles. */
export function normalizeGloss(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\([^)]*\)/g, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w && !FR_STOPWORDS.has(w))
    .join(" ")
    .trim();
}

/** Découpe une glose en alternatives (« voyager / voyage ; trip »). */
export function glossAlternatives(s: string | null | undefined): string[] {
  if (!s) return [];
  return s
    .split(/[\/;,，、|]| ou | or /)
    .map((p) => normalizeGloss(p))
    .filter(Boolean);
}

/**
 * Vrai si la réponse correspond à l'une des gloses attendues
 * (égalité normalisée, ou faute de frappe légère sur un mot long).
 */
export function glossMatches(answer: string, ...glosses: (string | null | undefined)[]): boolean {
  const a = normalizeGloss(answer);
  if (!a) return false;
  const alts = glosses.flatMap((g) => glossAlternatives(g));
  for (const alt of alts) {
    if (alt === a) return true;
    if (alt.length >= 5 && levenshtein(alt, a) <= 1) return true;
    // « payer » vs « payer qqch » : la réponse couvre tous les mots significatifs.
    const altWords = alt.split(" ");
    const aWords = new Set(a.split(" "));
    if (altWords.length > 1 && altWords.every((w) => aWords.has(w))) return true;
  }
  return false;
}

/** Découpe une phrase chinoise en segments (mots) via Intl.Segmenter. */
export function segmentChinese(sentence: string): string[] {
  const clean = sentence.trim();
  if (!clean) return [];
  const Seg = (Intl as unknown as { Segmenter?: typeof Intl.Segmenter }).Segmenter;
  if (!Seg) return [...clean].filter((c) => c.trim());
  const seg = new Seg("zh", { granularity: "word" });
  const out: string[] = [];
  for (const s of seg.segment(clean)) {
    if (s.segment.trim()) out.push(s.segment);
  }
  return out;
}

/** Clé canonique de déduplication. */
export function canonicalKey(type: string, primary: string): string {
  const norm = containsHanzi(primary) ? normalizeHanzi(primary) : normalizeGloss(primary);
  return `${type}:${norm}`;
}
