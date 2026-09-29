/**
 * Moteur de répétition espacée (voir docs/SPACED_REPETITION.md).
 * Fonctions pures : aucune dépendance à la base de données.
 */

export type Result = "CORRECT" | "MOSTLY_CORRECT" | "INCORRECT" | "SKIPPED";
export type Dimension = "RECOGNITION" | "PRODUCTION" | "LISTENING" | "PRONUNCIATION" | "USAGE";

export interface ScheduleState {
  intervalDays: number;
  ease: number;
  reps: number;
  lapses: number;
  streak: number;
  lastReviewAt: Date | null;
  nextReviewAt: Date | null;
}

export const DAY_MS = 86_400_000;
export const MIN_EASE = 1.3;
export const MAX_EASE = 3.0;
export const INITIAL_EASE = 2.3;
export const MAX_INTERVAL_DAYS = 365;
/** Délai avant de revoir un élément raté (réapparition dans la session / le jour même). */
export const RELEARN_DELAY_MS = 10 * 60_000;

/**
 * Facteur par dimension : réussir une reconnaissance passive fait moins progresser
 * l'intervalle que réussir une production (la reconnaissance n'est pas la maîtrise).
 */
export const DIMENSION_FACTOR: Record<Dimension, number> = {
  RECOGNITION: 0.8,
  PRODUCTION: 1.0,
  LISTENING: 0.9,
  PRONUNCIATION: 1.0,
  USAGE: 1.1,
};

export function initialState(): ScheduleState {
  return {
    intervalDays: 0,
    ease: INITIAL_EASE,
    reps: 0,
    lapses: 0,
    streak: 0,
    lastReviewAt: null,
    nextReviewAt: null,
  };
}

export interface ScheduleOptions {
  now: Date;
  dimension: Dimension;
  /** Auto-évaluation « facile » : bonus d'intervalle. */
  easy?: boolean;
  /** Générateur aléatoire (injectable pour les tests). */
  random?: () => number;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Calcule le nouvel état après une tentative. */
export function schedule(state: ScheduleState, result: Result, opts: ScheduleOptions): ScheduleState {
  const { now, dimension } = opts;
  const random = opts.random ?? Math.random;

  if (result === "INCORRECT" || result === "SKIPPED") {
    const wasLearned = state.reps > 0 && state.streak > 0;
    return {
      intervalDays: state.reps > 0 ? Math.max(1, state.intervalDays * 0.4) : 0,
      ease: clamp(state.ease - (result === "INCORRECT" ? 0.2 : 0.1), MIN_EASE, MAX_EASE),
      reps: state.reps,
      lapses: state.lapses + (wasLearned ? 1 : 0),
      streak: 0,
      lastReviewAt: now,
      nextReviewAt: new Date(now.getTime() + RELEARN_DELAY_MS),
    };
  }

  const mostly = result === "MOSTLY_CORRECT";
  let ease = state.ease;
  if (mostly) ease -= 0.15;
  else if (opts.easy) ease += 0.1;
  ease = clamp(ease, MIN_EASE, MAX_EASE);

  const factor = DIMENSION_FACTOR[dimension] * (opts.easy ? 1.3 : 1);
  let interval: number;

  if (state.reps === 0 || state.intervalDays === 0) {
    // Première réussite.
    interval = opts.easy ? 3 : 1;
  } else if (state.streak === 0) {
    // Réussite juste après un oubli : on repart de l'intervalle réduit.
    interval = mostly ? Math.max(1, state.intervalDays * 0.8) : state.intervalDays;
  } else {
    const elapsed = state.lastReviewAt ? (now.getTime() - state.lastReviewAt.getTime()) / DAY_MS : state.intervalDays;
    // Cible « à l'heure » : 3 jours pour la 2e réussite, puis intervalle × facilité.
    const target =
      state.reps === 1
        ? (mostly ? 2 : 3) * factor
        : mostly
          ? state.intervalDays * 1.2
          : state.intervalDays * ease * factor;
    if (elapsed < state.intervalDays) {
      // Révision anticipée (préparation de cours, session supplémentaire) :
      // progression proportionnelle au temps réellement écoulé.
      const ratio = clamp(elapsed / Math.max(state.intervalDays, 0.0001), 0, 1);
      interval = state.intervalDays + (target - state.intervalDays) * ratio;
    } else if (state.reps === 1 || mostly) {
      interval = target;
    } else {
      // Révision en retard réussie : on crédite une partie du retard.
      const lateBonus = (elapsed - state.intervalDays) * 0.5;
      interval = (state.intervalDays + lateBonus) * ease * factor;
    }
  }

  interval = clamp(interval, 1, MAX_INTERVAL_DAYS);
  if (interval > 3) interval *= 0.95 + random() * 0.1; // léger aléa pour étaler la charge
  interval = Math.round(interval * 100) / 100;

  return {
    intervalDays: interval,
    ease,
    reps: state.reps + 1,
    lapses: state.lapses,
    streak: state.streak + 1,
    lastReviewAt: now,
    nextReviewAt: new Date(now.getTime() + interval * DAY_MS),
  };
}

/** Fin de la journée locale (les éléments « dus aujourd'hui » incluent ceux dus avant minuit). */
export function endOfDay(d: Date): Date {
  const e = new Date(d);
  e.setHours(23, 59, 59, 999);
  return e;
}

export function startOfDay(d: Date): Date {
  const s = new Date(d);
  s.setHours(0, 0, 0, 0);
  return s;
}

export function isDue(state: Pick<ScheduleState, "nextReviewAt" | "reps">, now: Date): boolean {
  if (state.reps === 0 && !state.nextReviewAt) return false;
  return !!state.nextReviewAt && state.nextReviewAt.getTime() <= endOfDay(now).getTime();
}
