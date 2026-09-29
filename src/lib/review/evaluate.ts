/**
 * Évaluation locale des réponses (sans IA).
 * Lorsque la comparaison automatique n'est pas fiable (sens libre, traduction),
 * on renvoie `needs_judgment` : l'utilisateur s'auto-évalue ou demande l'avis de l'IA.
 */
import { comparePinyin, looksLikePinyin } from "@/lib/chinese/pinyin";
import { containsHanzi, glossMatches, normalizeHanzi } from "@/lib/chinese/text";
import type { ExerciseSpec, ExerciseType } from "./exercises";

export type MistakeCategory =
  | "MEANING"
  | "CHARACTER"
  | "PINYIN"
  | "TONE"
  | "PRONUNCIATION"
  | "GRAMMAR"
  | "WORD_ORDER"
  | "CLASSIFIER"
  | "LISTENING"
  | "USAGE"
  | "OTHER";

export type FinalResult = "CORRECT" | "MOSTLY_CORRECT" | "INCORRECT" | "SKIPPED";

export type LocalEvaluation =
  | {
      status: "final";
      result: FinalResult;
      method: "EXACT" | "FUZZY";
      category: MistakeCategory | null;
      feedback: string | null;
    }
  | { status: "needs_judgment" };

/** Catégorie d'erreur par défaut quand la réponse est fausse sans précision. */
export function defaultCategory(type: ExerciseType): MistakeCategory {
  switch (type) {
    case "RECOGNITION":
    case "PRODUCTION":
      return "MEANING";
    case "PINYIN":
      return "PINYIN";
    case "TONE":
      return "TONE";
    case "LISTENING":
    case "LISTENING_MEANING":
      return "LISTENING";
    case "FILL_BLANK":
    case "TRANSLATION":
      return "USAGE";
    case "SENTENCE_RECONSTRUCTION":
      return "WORD_ORDER";
    case "GRAMMAR":
      return "GRAMMAR";
    case "SPEAKING":
      return "PRONUNCIATION";
  }
}

function final(
  result: FinalResult,
  method: "EXACT" | "FUZZY",
  category: MistakeCategory | null,
  feedback: string | null,
): LocalEvaluation {
  return { status: "final", result, method, category: result === "CORRECT" ? null : category, feedback };
}

function diffChars(answer: string, expected: string): string | null {
  const a = [...answer];
  const e = [...expected];
  if (a.length !== e.length) return null;
  const diffs = e.map((c, i) => (c !== a[i] ? `${a[i]} au lieu de ${c}` : null)).filter(Boolean);
  return diffs.length > 0 && diffs.length <= 2 && diffs.length < e.length ? diffs.join(", ") : null;
}

function evaluateHanzi(spec: ExerciseSpec, answer: string): LocalEvaluation {
  const expected = normalizeHanzi(spec.answer.expected);
  const type = spec.type;
  if (containsHanzi(answer)) {
    const given = normalizeHanzi(answer);
    if (given === expected || spec.answer.alternatives.some((alt) => normalizeHanzi(alt) === given)) {
      return final("CORRECT", "EXACT", null, null);
    }
    const diff = diffChars(given, expected);
    if (diff) {
      return final(
        "INCORRECT",
        "EXACT",
        type === "LISTENING" ? "LISTENING" : "CHARACTER",
        `Caractère incorrect : ${diff}.`,
      );
    }
    return final("INCORRECT", "EXACT", defaultCategory(type), null);
  }
  if (looksLikePinyin(answer) && spec.answer.pinyin && type !== "GRAMMAR") {
    const cmp = comparePinyin(answer, spec.answer.pinyin);
    switch (cmp.kind) {
      case "exact":
        return final("CORRECT", "EXACT", null, `Pinyin juste. Retiens aussi les caractères : ${spec.answer.expected}.`);
      case "tones_missing":
        return final("MOSTLY_CORRECT", "EXACT", "TONE", "Bonne syllabe, mais sans les tons.");
      case "wrong_tones":
        return final("MOSTLY_CORRECT", "EXACT", "TONE", `Syllabes justes, mais ton incorrect (attendu : ${spec.answer.pinyin}).`);
      case "wrong_syllables":
        return final("INCORRECT", "EXACT", type === "LISTENING" ? "LISTENING" : defaultCategory(type), null);
    }
  }
  return final("INCORRECT", "EXACT", defaultCategory(type), null);
}

function evaluatePinyin(spec: ExerciseSpec, answer: string): LocalEvaluation {
  if (containsHanzi(answer)) {
    return final("INCORRECT", "EXACT", "PINYIN", "Écris le pinyin, pas les caractères.");
  }
  const cmp = comparePinyin(answer, spec.answer.expected);
  switch (cmp.kind) {
    case "exact":
      return final("CORRECT", "EXACT", null, null);
    case "tones_missing":
      return final("MOSTLY_CORRECT", "EXACT", "TONE", "Syllabes justes, mais indique les tons.");
    case "wrong_tones":
      return final("INCORRECT", "EXACT", "TONE", "Syllabes justes, mais les tons sont faux.");
    case "wrong_syllables":
      return final("INCORRECT", "EXACT", "PINYIN", null);
  }
}

export function evaluateLocally(spec: ExerciseSpec, rawAnswer: string): LocalEvaluation {
  const answer = rawAnswer.trim();
  if (!answer) return final("INCORRECT", "EXACT", null, null);

  switch (spec.answer.evaluation) {
    case "hanzi":
      return evaluateHanzi(spec, answer);
    case "pinyin":
      return evaluatePinyin(spec, answer);
    case "gloss":
      return glossMatches(answer, ...spec.answer.alternatives)
        ? final("CORRECT", "FUZZY", null, null)
        : { status: "needs_judgment" };
    case "order":
      return normalizeHanzi(answer) === normalizeHanzi(spec.answer.expected)
        ? final("CORRECT", "EXACT", null, null)
        : final("INCORRECT", "EXACT", "WORD_ORDER", "L'ordre des mots n'est pas correct.");
    case "open":
      if (containsHanzi(answer) && normalizeHanzi(answer) === normalizeHanzi(spec.answer.expected)) {
        return final("CORRECT", "EXACT", null, null);
      }
      return { status: "needs_judgment" };
  }
}
