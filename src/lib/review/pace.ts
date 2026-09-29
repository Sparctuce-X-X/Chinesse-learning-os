/**
 * Arrêt conseillé en cours de session (fonction pure) : on propose de s'arrêter quand les réponses
 * se dégradent nettement ou que la session dure bien plus que prévu. Ce n'est qu'une proposition :
 * les exercices non faits ne sont pas perdus (les révisions restent dues, les nouveautés restent à venir).
 */
import type { Result } from "./scheduler";
import { SECONDS_PER_EXERCISE } from "./session-plan";

export type StopReason = "fatigue" | "overtime";

/** Nombre de réponses récentes observées pour juger la fatigue. */
export const FATIGUE_WINDOW = 8;
/** Taux de réussite (réussi = 1, presque = 0,5) en dessous duquel on propose d'arrêter. */
export const FATIGUE_THRESHOLD = 0.6;
/** Pas de proposition quand il ne reste presque plus rien : autant finir. */
export const MIN_REMAINING = 3;

/** Temps actif d'une réponse : temps de réponse plafonné + lecture de la correction. */
export function activeMs(responseTimeMs: number | null | undefined): number {
  return Math.min(responseTimeMs ?? 20_000, 120_000) + 6_000;
}

export function plannedSeconds(plan: { reason: string }[]): number {
  return plan.reduce((s, e) => s + (e.reason === "new" ? SECONDS_PER_EXERCISE.new : SECONDS_PER_EXERCISE.review), 0);
}

export function stopSuggestion(input: {
  /** Résultats dans l'ordre, hors nouveautés (se tromper sur une notion nouvelle est normal) et hors exercices passés. */
  results: Result[];
  activeSeconds: number;
  plannedSeconds: number;
  remaining: number;
}): StopReason | null {
  if (input.remaining < MIN_REMAINING) return null;
  const recent = input.results.slice(-FATIGUE_WINDOW);
  if (recent.length === FATIGUE_WINDOW) {
    const score = recent.reduce((s, r) => s + (r === "CORRECT" ? 1 : r === "MOSTLY_CORRECT" ? 0.5 : 0), 0) / recent.length;
    if (score < FATIGUE_THRESHOLD) return "fatigue";
  }
  if (input.plannedSeconds > 0 && input.activeSeconds > Math.max(input.plannedSeconds * 1.5, input.plannedSeconds + 300)) return "overtime";
  return null;
}
