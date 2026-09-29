/**
 * Maîtrise multidimensionnelle : chaque dimension est un score 0–100 mis à jour
 * par moyenne mobile exponentielle à partir des tentatives réelles.
 */
import type { Dimension, Result } from "./scheduler";

export interface DimensionScores {
  recognitionScore: number;
  productionScore: number;
  listeningScore: number;
  pronunciationScore: number;
  usageScore: number;
}

export const EMPTY_SCORES: DimensionScores = {
  recognitionScore: 0,
  productionScore: 0,
  listeningScore: 0,
  pronunciationScore: 0,
  usageScore: 0,
};

export const DIMENSION_FIELD: Record<Dimension, keyof DimensionScores> = {
  RECOGNITION: "recognitionScore",
  PRODUCTION: "productionScore",
  LISTENING: "listeningScore",
  PRONUNCIATION: "pronunciationScore",
  USAGE: "usageScore",
};

const TARGET: Record<Result, number | null> = {
  CORRECT: 100,
  MOSTLY_CORRECT: 60,
  INCORRECT: 0,
  SKIPPED: 0,
};

export const SCORE_ALPHA = 0.35;

export function updateScores(scores: DimensionScores, dimension: Dimension, result: Result): DimensionScores {
  const target = TARGET[result];
  if (target === null) return scores;
  const field = DIMENSION_FIELD[dimension];
  const next = { ...scores };
  next[field] = Math.round((scores[field] + SCORE_ALPHA * (target - scores[field])) * 10) / 10;
  // Produire un mot implique de le reconnaître : petite contribution croisée.
  if (dimension === "PRODUCTION" && result === "CORRECT") {
    next.recognitionScore = Math.round((scores.recognitionScore + 0.15 * (100 - scores.recognitionScore)) * 10) / 10;
  }
  return next;
}

/** Recalcule les scores depuis l'historique complet (ordre chronologique). */
export function recomputeScores(attempts: { dimension: Dimension; result: Result }[]): DimensionScores {
  return attempts.reduce((acc, a) => updateScores(acc, a.dimension, a.result), { ...EMPTY_SCORES });
}

export type MasteryLevel = "NEW" | "LEARNING" | "WEAK" | "CONSOLIDATED" | "MASTERED";

export const MASTERY_LABEL: Record<MasteryLevel, string> = {
  NEW: "Nouveau",
  LEARNING: "En cours",
  WEAK: "À travailler",
  CONSOLIDATED: "Consolidé",
  MASTERED: "Maîtrisé",
};

export function scoreLabel(score: number, attempts: number): string {
  if (attempts === 0) return "Pas encore testé";
  if (score >= 80) return "Élevée";
  if (score >= 55) return "Moyenne";
  return "À travailler";
}

export function masteryLevel(input: {
  reps: number;
  intervalDays: number;
  lapses: number;
  productionScore: number;
  recognitionScore: number;
  activeMistakes: number;
}): MasteryLevel {
  if (input.reps === 0) return "NEW";
  if (input.activeMistakes >= 2 || (input.lapses >= 2 && input.intervalDays < 7)) return "WEAK";
  const skill = Math.max(input.productionScore, input.recognitionScore * 0.8);
  if (input.intervalDays >= 21 && input.productionScore >= 70) return "MASTERED";
  if (input.intervalDays >= 7 && skill >= 55) return "CONSOLIDATED";
  if (input.activeMistakes >= 1 && skill < 50) return "WEAK";
  return "LEARNING";
}

/**
 * Niveau d'une connaissance depuis ses lignes en base : état de révision (null si jamais révisée)
 * et erreurs non résolues (le poids des erreurs = somme de leurs occurrences). Point d'entrée unique
 * pour que fiches, listes, cours, thèmes et progression affichent le même niveau.
 */
export function masteryOf(
  state: { reps: number; intervalDays: number; lapses: number; productionScore: number; recognitionScore: number } | null | undefined,
  activeMistakes: { occurrences: number }[],
): MasteryLevel {
  return masteryLevel({
    reps: state?.reps ?? 0,
    intervalDays: state?.intervalDays ?? 0,
    lapses: state?.lapses ?? 0,
    productionScore: state?.productionScore ?? 0,
    recognitionScore: state?.recognitionScore ?? 0,
    activeMistakes: activeMistakes.reduce((n, m) => n + m.occurrences, 0),
  });
}
