/**
 * Composition automatique d'une session (fonction pure).
 * Entrée : instantané des connaissances + état de révision + erreurs actives.
 * Sortie : liste ordonnée d'exercices.
 */
import { DAY_MS, endOfDay } from "./scheduler";
import { generateExercise, type ExerciseSpec, type ExerciseType, type KnowledgeForExercise } from "./exercises";

export interface PlanItem extends KnowledgeForExercise {
  intervalDays: number;
  nextReviewAt: Date | null;
  lastReviewAt: Date | null;
  lapses: number;
  /** Somme des occurrences des erreurs non résolues. */
  mistakeOccurrences: number;
  /** Date du cours le plus récent où la connaissance apparaît. */
  lessonDate: Date | null;
  /** Position dans le cours (page) pour garder l'ordre pédagogique des nouveautés. */
  order: number;
  recentTypes: ExerciseType[];
  /** false si la connaissance vient uniquement de ressources externes (priorité plus basse). */
  fromCourse?: boolean;
}

/** Part maximale des nouveautés réservée aux mots des ressources externes (le reste va aux cours). */
export const RESOURCE_NEW_SHARE = 1 / 3;

export type SessionKind = "DAILY" | "MISTAKES" | "PREPARATION" | "LESSON" | "KNOWLEDGE";

export interface PlanOptions {
  now: Date;
  kind: SessionKind;
  maxReviews: number;
  newItems: number;
  listening: boolean;
  /** Pour LESSON / PREPARATION : identifiants à privilégier. */
  focusIds?: Set<string>;
}

/** Secondes estimées par exercice (pour la durée affichée). */
export const SECONDS_PER_EXERCISE = { new: 35, review: 22 };

/** Priorité d'une révision : retard relatif, erreurs, faiblesse en production, fraîcheur du cours. */
export function priority(item: PlanItem, now: Date): number {
  let p = 0;
  if (item.nextReviewAt) {
    const overdueDays = (now.getTime() - item.nextReviewAt.getTime()) / DAY_MS;
    p += Math.min(3, Math.max(0, overdueDays) / Math.max(1, item.intervalDays)) + (overdueDays >= 0 ? 1 : 0);
  }
  p += Math.min(3, item.mistakeOccurrences) * 0.6;
  p += ((100 - item.scores.production) / 100) * 0.5;
  p += Math.min(2, item.lapses) * 0.2;
  if (item.fromCourse !== false && item.lessonDate && now.getTime() - item.lessonDate.getTime() < 7 * DAY_MS) p += 0.3;
  return Math.round(p * 1000) / 1000;
}

export interface SessionCounts {
  due: number;
  newAvailable: number;
  mistakes: number;
}

export function isNewItem(item: Pick<PlanItem, "reps" | "nextReviewAt">): boolean {
  return item.reps === 0 && !item.nextReviewAt;
}

export function isDueItem(item: Pick<PlanItem, "reps" | "nextReviewAt">, now: Date): boolean {
  return !!item.nextReviewAt && item.nextReviewAt.getTime() <= endOfDay(now).getTime();
}

export function countWork(items: PlanItem[], now: Date): SessionCounts {
  return {
    due: items.filter((i) => isDueItem(i, now)).length,
    newAvailable: items.filter((i) => isNewItem(i)).length,
    mistakes: items.filter((i) => i.mistakeOccurrences > 0).length,
  };
}

/** Sélectionne les connaissances de la session selon son type. */
export function selectItems(items: PlanItem[], opts: PlanOptions): { item: PlanItem; reason: ExerciseSpec["reason"] }[] {
  const { now } = opts;
  const byPriority = (a: PlanItem, b: PlanItem) => priority(b, now) - priority(a, now);
  const newestFirst = (a: PlanItem, b: PlanItem) =>
    (b.lessonDate?.getTime() ?? 0) - (a.lessonDate?.getTime() ?? 0) || a.order - b.order;

  if (opts.kind === "MISTAKES") {
    return items
      .filter((i) => i.mistakeOccurrences > 0)
      .sort((a, b) => b.mistakeOccurrences - a.mistakeOccurrences || byPriority(a, b))
      .slice(0, opts.maxReviews)
      .map((item) => ({ item, reason: "mistake" as const }));
  }

  if (opts.kind === "KNOWLEDGE" || opts.kind === "LESSON") {
    const focus = items.filter((i) => opts.focusIds?.has(i.id));
    return focus
      .sort((a, b) => (isNewItem(a) === isNewItem(b) ? byPriority(a, b) : isNewItem(a) ? 1 : -1))
      .slice(0, opts.maxReviews)
      .map((item) => ({ item, reason: isNewItem(item) ? ("new" as const) : ("extra" as const) }));
  }

  if (opts.kind === "PREPARATION") {
    const picked = new Map<string, { item: PlanItem; reason: ExerciseSpec["reason"] }>();
    const add = (list: PlanItem[], reason: ExerciseSpec["reason"], max: number) => {
      for (const item of list) {
        if (picked.size >= opts.maxReviews || max <= 0) break;
        if (picked.has(item.id)) continue;
        picked.set(item.id, { item, reason });
        max--;
      }
    };
    const recurring = items.filter((i) => i.mistakeOccurrences >= 2).sort((a, b) => b.mistakeOccurrences - a.mistakeOccurrences);
    const lastLesson = items.filter((i) => opts.focusIds?.has(i.id)).sort((a, b) => a.order - b.order);
    const weak = items
      .filter((i) => i.reps > 0 && (i.scores.production < 60 || i.lapses > 0))
      .sort((a, b) => a.scores.production - b.scores.production);
    add(recurring, "mistake", Math.ceil(opts.maxReviews * 0.3));
    add(lastLesson, "prep", Math.ceil(opts.maxReviews * 0.5));
    add(weak, "prep", opts.maxReviews);
    return [...picked.values()];
  }

  // DAILY
  const due = items.filter((i) => isDueItem(i, now)).sort(byPriority);
  const dueSelected = due.slice(0, opts.maxReviews);
  const selectedIds = new Set(dueSelected.map((i) => i.id));

  // Erreurs récurrentes non dues : on en réinjecte quelques-unes.
  const recurring = items
    .filter((i) => !selectedIds.has(i.id) && i.mistakeOccurrences >= 2 && !isNewItem(i))
    .sort((a, b) => b.mistakeOccurrences - a.mistakeOccurrences)
    .slice(0, Math.max(0, Math.min(3, opts.maxReviews - dueSelected.length)));
  recurring.forEach((i) => selectedIds.add(i.id));

  // Nouveautés : moins si l'arriéré est important (jours manqués).
  const backlogRatio = due.length / Math.max(1, opts.maxReviews);
  const newBudget = backlogRatio >= 1 ? Math.min(2, opts.newItems) : Math.round(opts.newItems * (1 - backlogRatio * 0.5));
  const room = Math.max(0, opts.maxReviews + newBudget - dueSelected.length - recurring.length);
  const fresh = pickNewItems(
    items.filter((i) => isNewItem(i) && !selectedIds.has(i.id)).sort(newestFirst),
    Math.min(newBudget, room),
  );

  return [
    ...dueSelected.map((item) => ({
      item,
      reason: item.mistakeOccurrences > 0 ? ("mistake" as const) : ("due" as const),
    })),
    ...recurring.map((item) => ({ item, reason: "mistake" as const })),
    ...fresh.map((item) => ({ item, reason: "new" as const })),
  ];
}

/**
 * Nouveautés : les cours d'abord ; les mots des ressources externes ont au plus un tiers des places
 * (au moins une s'il y en a), et prennent les places que les cours n'utilisent pas.
 */
export function pickNewItems(sorted: PlanItem[], budget: number): PlanItem[] {
  if (budget <= 0) return [];
  const course = sorted.filter((i) => i.fromCourse !== false);
  const external = sorted.filter((i) => i.fromCourse === false);
  const externalSlots = external.length && budget >= 2 ? Math.max(1, Math.floor(budget * RESOURCE_NEW_SHARE)) : 0;
  const fromCourse = course.slice(0, budget - Math.min(externalSlots, external.length));
  const fromExternal = external.slice(0, budget - fromCourse.length);
  const chosen = new Set([...fromCourse, ...fromExternal]);
  return sorted.filter((i) => chosen.has(i));
}

/** Entrelace les nouveautés au milieu des révisions (pas de bloc de nouveautés à la fin). */
export function interleave<T extends { reason: string }>(list: T[]): T[] {
  const fresh = list.filter((x) => x.reason === "new");
  const others = list.filter((x) => x.reason !== "new");
  if (fresh.length === 0 || others.length === 0) return list;
  const out: T[] = [];
  const step = Math.max(1, Math.floor(others.length / (fresh.length + 1)));
  let f = 0;
  others.forEach((o, i) => {
    out.push(o);
    if ((i + 1) % step === 0 && f < fresh.length) out.push(fresh[f++]);
  });
  while (f < fresh.length) out.push(fresh[f++]);
  return out;
}

export function buildPlan(items: PlanItem[], opts: PlanOptions): ExerciseSpec[] {
  const selected = interleave(selectItems(items, opts));
  const plan: ExerciseSpec[] = [];
  selected.forEach(({ item, reason }, idx) => {
    const spec = generateExercise(item, {
      reason,
      recentTypes: item.recentTypes,
      listening: opts.listening,
      seed: (Math.floor(opts.now.getTime() / 1000) + idx) % 100_000,
    });
    if (spec) plan.push(spec);
  });
  return plan;
}

/**
 * Nouveautés autorisées dans une session quotidienne : le réglage par session, sans dépasser
 * ce qui reste du plafond du jour (les notions déjà vues aujourd'hui, toutes sessions confondues).
 */
export function dailyNewBudget(opts: { perSession: number; perDay: number; introducedToday: number; reviewsOnly?: boolean }): number {
  if (opts.reviewsOnly) return 0;
  return Math.max(0, Math.min(opts.perSession, opts.perDay - opts.introducedToday));
}

export function estimateMinutes(plan: Pick<ExerciseSpec, "reason">[]): number {
  const secs = plan.reduce((s, e) => s + (e.reason === "new" ? SECONDS_PER_EXERCISE.new : SECONDS_PER_EXERCISE.review), 0);
  return Math.max(1, Math.round(secs / 60));
}
