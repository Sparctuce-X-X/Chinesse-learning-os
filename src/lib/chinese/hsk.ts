/**
 * Liste de vocabulaire HSK 3.0 (niveaux 1 à 7, « 7 » regroupant 7-9), avec rang de fréquence,
 * pinyin et sens anglais. Source : « complete-hsk-vocabulary » (Yanis Zafirópulos, licence MIT),
 * compactée par scripts/build-hsk-data.mjs.
 * Sert à estimer la difficulté d'une ressource et à découper les textes en mots.
 */
import rows from "./hsk-data.json";

export interface HskEntry {
  word: string;
  /** Niveau HSK 3.0 : 1–6, 7 = niveaux 7 à 9. */
  level: number;
  /** Rang de fréquence (1 = le plus fréquent). */
  frequency: number;
  pinyin: string;
  english: string;
}

let dict: Map<string, HskEntry> | null = null;

export function hskDictionary(): Map<string, HskEntry> {
  if (!dict) {
    dict = new Map();
    for (const r of rows as [string, number, number, string, string][]) {
      if (!dict.has(r[0])) dict.set(r[0], { word: r[0], level: r[1], frequency: r[2], pinyin: r[3], english: r[4] });
    }
  }
  return dict;
}

export function hskLookup(word: string): HskEntry | undefined {
  return hskDictionary().get(word);
}
