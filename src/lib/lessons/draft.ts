/**
 * Transformation d'une extraction en brouillon de validation (fonctions pures).
 */
import type { Draft, DraftSection, LessonExtraction } from "@/lib/ai/schemas";
import { normalizeHanzi } from "@/lib/chinese/text";
import { toneless } from "@/lib/chinese/pinyin";

let counter = 0;
export function draftId(prefix: string): string {
  counter = (counter + 1) % 1_000_000;
  return `${prefix}_${Date.now().toString(36)}${counter.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

export function extractionToDraft(ex: LessonExtraction): Draft {
  const meta = (prefix: string) => ({ id: draftId(prefix), decision: "pending" as const, edited: false, duplicate: null });
  // Dédoublonnage interne (même hanzi dans l'extraction).
  const seen = new Set<string>();
  const vocabulary = ex.vocabulary.filter((v) => {
    const k = normalizeHanzi(v.hanzi);
    if (!k || seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  const seenSentences = new Set<string>();
  const sentences = ex.sentences.filter((s) => {
    const k = normalizeHanzi(s.hanzi);
    if (!k || seenSentences.has(k) || seen.has(k)) return false;
    seenSentences.add(k);
    return true;
  });
  return {
    lesson: ex.lesson,
    vocabulary: vocabulary.map((v) => ({ ...v, ...meta("v"), resource: null })),
    grammarPoints: ex.grammarPoints.map((g) => ({ ...g, ...meta("g") })),
    sentences: sentences.map((s) => ({ ...s, ...meta("s") })),
    corrections: ex.corrections.map((c) => ({ ...c, ...meta("c") })),
    exercises: ex.exercises.map((e) => ({ ...e, ...meta("e") })),
    warnings: ex.warnings,
  };
}

export const SECTIONS: DraftSection[] = ["vocabulary", "grammarPoints", "sentences", "corrections", "exercises"];

export function draftCounts(d: Draft) {
  const all = SECTIONS.flatMap((s) => d[s] as { decision: string; confidence?: string }[]);
  return {
    total: all.length,
    approved: all.filter((i) => i.decision === "approved").length,
    rejected: all.filter((i) => i.decision === "rejected").length,
    pending: all.filter((i) => i.decision === "pending").length,
    lowConfidence: all.filter((i) => i.confidence === "LOW" && i.decision !== "rejected").length,
  };
}

export function approveAll(d: Draft): Draft {
  const next = structuredClone(d);
  for (const s of SECTIONS) {
    for (const item of next[s] as { decision: string }[]) {
      if (item.decision === "pending") item.decision = "approved";
    }
  }
  return next;
}

/**
 * Deux entrées de vocabulaire avec les mêmes caractères sont le même mot,
 * sauf si leurs pinyin (sans ton) diffèrent — ex. 行 xíng / háng.
 */
export function sameVocabulary(
  a: { hanzi: string; pinyin: string | null },
  b: { hanzi: string; pinyin: string | null },
): boolean {
  if (normalizeHanzi(a.hanzi) !== normalizeHanzi(b.hanzi)) return false;
  if (!a.pinyin || !b.pinyin) return true;
  return toneless(a.pinyin) === toneless(b.pinyin);
}
