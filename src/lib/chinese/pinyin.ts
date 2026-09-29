/**
 * Outils pinyin : normalisation, conversion tons numériques ↔ diacritiques,
 * découpage en syllabes et comparaison tolérante.
 */

const TONE_MARKS: Record<string, string[]> = {
  a: ["ā", "á", "ǎ", "à"],
  e: ["ē", "é", "ě", "è"],
  i: ["ī", "í", "ǐ", "ì"],
  o: ["ō", "ó", "ǒ", "ò"],
  u: ["ū", "ú", "ǔ", "ù"],
  ü: ["ǖ", "ǘ", "ǚ", "ǜ"],
};

const MARKED_TO_BASE: Record<string, { base: string; tone: number }> = {};
for (const [base, marks] of Object.entries(TONE_MARKS)) {
  marks.forEach((m, i) => {
    MARKED_TO_BASE[m] = { base, tone: i + 1 };
  });
}

export interface Syllable {
  /** Syllabe sans ton, en minuscules, avec « ü ». */
  base: string;
  /** 1 à 4, 5 = ton neutre, 0 = ton inconnu (non indiqué). */
  tone: number;
}

/** Remplace v / u: par ü et met en minuscules. */
function normalizeUmlaut(s: string): string {
  return s.toLowerCase().replace(/u:/g, "ü").replace(/v/g, "ü");
}

/** Place la marque de ton sur la bonne voyelle d'une syllabe (règles standard). */
export function applyTone(syllable: string, tone: number): string {
  const s = normalizeUmlaut(syllable);
  if (tone < 1 || tone > 4) return s;
  let idx = -1;
  if (s.includes("a")) idx = s.indexOf("a");
  else if (s.includes("e")) idx = s.indexOf("e");
  else if (s.includes("ou")) idx = s.indexOf("o");
  else {
    for (let i = s.length - 1; i >= 0; i--) {
      if ("iouü".includes(s[i])) {
        idx = i;
        break;
      }
    }
  }
  if (idx === -1) return s;
  const v = s[idx];
  const marked = TONE_MARKS[v]?.[tone - 1];
  if (!marked) return s;
  return s.slice(0, idx) + marked + s.slice(idx + 1);
}

/** Convertit « lv3 xing2 » ou « lu:3xing2 » en « lǚ xíng ». Laisse le reste inchangé. */
export function numberedToMarked(input: string): string {
  return input.replace(/([a-zA-ZüÜ:]+)([1-5])/g, (_, syl: string, t: string) =>
    applyTone(syl, Number(t)),
  );
}

/** Découpe un pinyin (diacritiques ou chiffres) en syllabes {base, tone}. */
export function parseSyllables(input: string): Syllable[] {
  const text = numberedToMarked(input.trim());
  const words = text
    .toLowerCase()
    .replace(/[''`’·.,;:!?，。！？、()（）\-_/]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  const out: Syllable[] = [];
  for (const w of words) {
    for (const piece of splitWord(w)) {
      let tone = 0;
      let base = "";
      for (const ch of piece) {
        const m = MARKED_TO_BASE[ch];
        if (m) {
          tone = m.tone;
          base += m.base;
        } else base += ch;
      }
      base = normalizeUmlaut(base);
      out.push({ base, tone });
    }
  }
  return out;
}

// Initiales et finales valides pour un découpage glouton des mots collés (« lǚxíng »).
const INITIALS = [
  "zh", "ch", "sh", "b", "p", "m", "f", "d", "t", "n", "l", "g", "k", "h",
  "j", "q", "x", "r", "z", "c", "s", "y", "w", "",
];
const FINALS = [
  "iang", "iong", "uang", "ueng", "ang", "eng", "ing", "ong", "ian", "iao", "uai",
  "uan", "üan", "van", "ai", "ei", "ao", "ou", "an", "en", "er", "ia", "ie", "in",
  "iu", "ua", "uo", "ui", "un", "ün", "üe", "ue", "a", "o", "e", "i", "u", "ü", "n", "ng", "m",
];

function stripMarks(s: string): string {
  let r = "";
  for (const ch of s) r += MARKED_TO_BASE[ch]?.base ?? ch;
  return r;
}

/** Découpe un mot pinyin collé en syllabes (glouton, préfère les syllabes longues). */
function splitWord(word: string): string[] {
  const plain = normalizeUmlaut(stripMarks(word));
  const chars = [...word];
  if (plain.length !== chars.length) return [word];
  const result: string[] = [];
  let i = 0;
  while (i < plain.length) {
    let best = 0;
    for (const ini of INITIALS) {
      if (!plain.startsWith(ini, i)) continue;
      for (const fin of FINALS) {
        const len = ini.length + fin.length;
        if (len <= best || fin === "") continue;
        if (plain.startsWith(fin, i + ini.length)) {
          // Évite de manger l'initiale de la syllabe suivante (« xian » vs « xi'an » reste ambigu).
          const next = plain.slice(i + len);
          if (fin.endsWith("n") && next && "aeiouü".includes(next[0]) && fin.length > 1) {
            const shorter = len - 1;
            if (shorter > best) best = shorter;
            continue;
          }
          if (fin.endsWith("ng") && next && "aeiouü".includes(next[0])) {
            const shorter = len - 1;
            if (shorter > best) best = shorter;
            continue;
          }
          best = len;
        }
      }
    }
    if (best === 0) return [word];
    result.push(chars.slice(i, i + best).join(""));
    i += best;
  }
  return result;
}

/** Pinyin sans ton, sans espace, minuscules — clé de comparaison. */
export function toneless(input: string): string {
  return parseSyllables(input)
    .map((s) => s.base)
    .join("");
}

/** Vrai si la chaîne ressemble à du pinyin (lettres latines, tons, chiffres 1-5). */
export function looksLikePinyin(input: string): boolean {
  const t = input.trim();
  if (!t) return false;
  if (/[\u3400-\u9fff]/.test(t)) return false;
  return /^[a-zA-Züüāáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜ1-5\s'’:-]+$/.test(t);
}

/** Vrai si le texte contient des diacritiques de ton pinyin. */
export function hasToneMarks(input: string): boolean {
  return /[āáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜ]/.test(input);
}

export type PinyinComparison =
  | { kind: "exact" }
  | { kind: "tones_missing" }
  | { kind: "wrong_tones"; positions: number[] }
  | { kind: "wrong_syllables" };

/**
 * Compare une réponse pinyin à la référence.
 * Le ton neutre (5) de la référence accepte l'absence de ton.
 */
export function comparePinyin(answer: string, expected: string): PinyinComparison {
  const a = parseSyllables(answer);
  const e = parseSyllables(expected);
  const aBase = a.map((s) => s.base).join("");
  const eBase = e.map((s) => s.base).join("");
  if (aBase !== eBase) return { kind: "wrong_syllables" };
  if (a.length !== e.length) {
    // Même lettres mais découpage différent : on compare quand même les tons dans l'ordre.
    const at = a.map((s) => s.tone).filter((t) => t > 0);
    const et = e.map((s) => s.tone).filter((t) => t > 0 && t < 5);
    if (at.length === 0) return et.length === 0 ? { kind: "exact" } : { kind: "tones_missing" };
    return at.join() === et.join() ? { kind: "exact" } : { kind: "wrong_tones", positions: [] };
  }
  const allMissing = a.every((s) => s.tone === 0);
  const expectedHasTones = e.some((s) => s.tone >= 1 && s.tone <= 4);
  if (allMissing && expectedHasTones) return { kind: "tones_missing" };
  const wrong: number[] = [];
  e.forEach((es, i) => {
    const at = a[i].tone;
    const et = es.tone;
    const neutral = et === 0 || et === 5;
    if (neutral) {
      if (at !== 0 && at !== 5) wrong.push(i);
    } else if (at !== et) wrong.push(i);
  });
  return wrong.length === 0 ? { kind: "exact" } : { kind: "wrong_tones", positions: wrong };
}
