import "server-only";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { getAIStatus } from "@/lib/ai";
import { evaluateAnswer } from "@/lib/ai/tasks";
import { aiErrorMessage } from "@/lib/ai/types";
import {
  ExerciseSpecSchema,
  toPublic,
  type ExerciseSpec,
  type ExerciseType,
  type PublicExercise,
} from "@/lib/review/exercises";
import { defaultCategory, evaluateLocally, type MistakeCategory } from "@/lib/review/evaluate";
import { updateScores } from "@/lib/review/mastery";
import { DAY_MS, schedule, startOfDay, type Result } from "@/lib/review/scheduler";
import { buildPlan, countWork, dailyNewBudget, estimateMinutes, type PlanItem, type SessionKind } from "@/lib/review/session-plan";
import { activeMs, plannedSeconds, stopSuggestion, type StopReason } from "@/lib/review/pace";
import { getUser } from "./user";

export class ReviewError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ReviewError";
  }
}

const PlanSchema = z.array(ExerciseSpecSchema);
const json = (v: unknown) => v as Prisma.InputJsonValue;

/** Nombre de réussites consécutives qui résolvent automatiquement une erreur. */
export const AUTO_RESOLVE_STREAK = 3;

// ─── Chargement des connaissances ─────────────────────────────────────────────

export async function loadPlanItems(userId: string): Promise<PlanItem[]> {
  const items = await prisma.knowledgeItem.findMany({
    where: { userId, status: "ACTIVE" },
    include: {
      vocabulary: true,
      sentence: true,
      grammarPoint: true,
      examples: { take: 6, orderBy: { createdAt: "asc" } },
      reviewState: true,
      mistakes: { where: { resolvedAt: null } },
      lessons: { include: { lesson: { select: { date: true, processingStatus: true, kind: true } } } },
      attempts: { orderBy: { createdAt: "desc" }, take: 3, select: { exerciseType: true } },
    },
  });
  return items
    .filter((k) => k.lessons.length === 0 || k.lessons.some((l) => l.lesson.processingStatus === "VALIDATED"))
    .map((k) => {
      const s = k.reviewState;
      const latest = k.lessons.reduce<{ date: Date | null; page: number }>(
        (acc, l) => (!acc.date || l.lesson.date > acc.date ? { date: l.lesson.date, page: l.sourcePage ?? 999 } : acc),
        { date: null, page: 999 },
      );
      const hanzi = k.vocabulary?.hanzi ?? k.sentence?.hanzi ?? null;
      return {
        id: k.id,
        type: k.type,
        hanzi,
        pinyin: k.vocabulary?.pinyin ?? k.sentence?.pinyin ?? null,
        french: k.vocabulary?.french ?? k.sentence?.french ?? k.grammarPoint?.french ?? null,
        english: k.vocabulary?.english ?? k.sentence?.english ?? null,
        grammar: k.grammarPoint
          ? { name: k.grammarPoint.name, structure: k.grammarPoint.structure, explanation: k.grammarPoint.explanation }
          : null,
        examples: k.examples.map((e) => ({ hanzi: e.hanzi, pinyin: e.pinyin, french: e.french, english: e.english })),
        reps: s?.reps ?? 0,
        scores: {
          recognition: s?.recognitionScore ?? 0,
          production: s?.productionScore ?? 0,
          listening: s?.listeningScore ?? 0,
        },
        mistakeCategories: k.mistakes.sort((a, b) => b.occurrences - a.occurrences).map((m) => m.category),
        intervalDays: s?.intervalDays ?? 0,
        nextReviewAt: s?.nextReviewAt ?? null,
        lastReviewAt: s?.lastReviewAt ?? null,
        lapses: s?.lapses ?? 0,
        mistakeOccurrences: k.mistakes.reduce((n, m) => n + m.occurrences, 0),
        lessonDate: latest.date,
        order: latest.page,
        // Connaissance d'un cours (ou ajoutée à la main) — sinon issue uniquement de ressources externes.
        fromCourse: k.lessons.length === 0 || k.lessons.some((l) => l.lesson.kind === "COURSE"),
        recentTypes: k.attempts.map((a) => a.exerciseType as ExerciseType).reverse(),
      } satisfies PlanItem;
    });
}

// ─── Aujourd'hui ──────────────────────────────────────────────────────────────

export interface TodaySummary {
  due: number;
  newAvailable: number;
  plannedCount: number;
  plannedNew: number;
  estimatedMinutes: number;
  recurringMistakes: number;
  activeMistakes: number;
  totalKnowledge: number;
  inProgressSessionId: string | null;
  inProgressRemaining: number;
  completedToday: number;
  /** Une session quotidienne a été terminée aujourd'hui : l'objectif du jour est atteint. */
  dayDone: boolean;
  /** Travail de la journée (sessions terminées). */
  today: { minutes: number; reviews: number; correct: number; newLearned: number };
  /** Plafond de nouvelles notions par jour et ce qu'il en reste. */
  newPerDay: number;
  newRemaining: number;
  /** Estimation de la session de demain. */
  tomorrow: { reviews: number; newItems: number; minutes: number };
}

/** Connaissances vues pour la première fois aujourd'hui (toutes sessions confondues). */
export async function newIntroducedToday(userId: string, now = new Date()): Promise<number> {
  const start = startOfDay(now);
  const seenToday = await prisma.reviewAttempt.findMany({
    where: { userId, createdAt: { gte: start } },
    distinct: ["knowledgeItemId"],
    select: { knowledgeItemId: true },
  });
  if (seenToday.length === 0) return 0;
  const seenBefore = await prisma.reviewAttempt.findMany({
    where: { userId, createdAt: { lt: start }, knowledgeItemId: { in: seenToday.map((a) => a.knowledgeItemId) } },
    distinct: ["knowledgeItemId"],
    select: { knowledgeItemId: true },
  });
  return seenToday.length - seenBefore.length;
}

export async function getTodaySummary(): Promise<TodaySummary> {
  const user = await getUser();
  const now = new Date();
  const [items, introduced] = await Promise.all([loadPlanItems(user.id), newIntroducedToday(user.id, now)]);
  const counts = countWork(items, now);
  const plan = buildPlan(items, {
    now,
    kind: "DAILY",
    maxReviews: sessionSize(user),
    newItems: dailyNewBudget({ perSession: user.newItemsPerSession, perDay: user.newItemsPerDay, introducedToday: introduced }),
    listening: false,
  });
  // Demain midi : ce qui sera dû d'ici la fin de la journée de demain, avec un plafond de nouveautés neuf.
  const tomorrowPlan = buildPlan(items, {
    now: new Date(startOfDay(now).getTime() + DAY_MS + DAY_MS / 2),
    kind: "DAILY",
    maxReviews: sessionSize(user),
    newItems: dailyNewBudget({ perSession: user.newItemsPerSession, perDay: user.newItemsPerDay, introducedToday: 0 }),
    listening: false,
  });
  const [recurring, active, inProgress, doneToday] = await Promise.all([
    prisma.mistake.count({ where: { userId: user.id, resolvedAt: null, occurrences: { gte: 2 } } }),
    prisma.mistake.count({ where: { userId: user.id, resolvedAt: null } }),
    findResumableSession(user.id),
    prisma.learningSession.findMany({
      where: { userId: user.id, completedAt: { gte: startOfDay(now) } },
      select: { kind: true, durationSeconds: true, reviewsCompleted: true, correctCount: true },
    }),
  ]);
  const inProgressPlan = inProgress ? PlanSchema.safeParse(inProgress.plan) : null;
  const tomorrowNew = tomorrowPlan.filter((p) => p.reason === "new").length;
  return {
    due: counts.due,
    newAvailable: counts.newAvailable,
    plannedCount: plan.length,
    plannedNew: plan.filter((p) => p.reason === "new").length,
    estimatedMinutes: plan.length ? estimateMinutes(plan) : 0,
    recurringMistakes: recurring,
    activeMistakes: active,
    totalKnowledge: items.length,
    inProgressSessionId: inProgress?.id ?? null,
    inProgressRemaining: inProgress && inProgressPlan?.success ? inProgressPlan.data.length - inProgress.currentIndex : 0,
    completedToday: doneToday.length,
    dayDone: doneToday.some((s) => s.kind === "DAILY"),
    today: {
      minutes: Math.round(doneToday.reduce((n, s) => n + s.durationSeconds, 0) / 60),
      reviews: doneToday.reduce((n, s) => n + s.reviewsCompleted, 0),
      correct: doneToday.reduce((n, s) => n + s.correctCount, 0),
      newLearned: introduced,
    },
    newPerDay: user.newItemsPerDay,
    newRemaining: Math.max(0, user.newItemsPerDay - introduced),
    tomorrow: {
      reviews: tomorrowPlan.length - tomorrowNew,
      newItems: tomorrowNew,
      minutes: tomorrowPlan.length ? estimateMinutes(tomorrowPlan) : 0,
    },
  };
}

function sessionSize(user: { maxReviewsPerSession: number; dailyGoalMinutes: number }): number {
  // Environ 25 s par exercice : on vise la durée quotidienne choisie.
  return Math.max(5, Math.min(user.maxReviewsPerSession, Math.round((user.dailyGoalMinutes * 60) / 25)));
}

async function findResumableSession(userId: string) {
  return prisma.learningSession.findFirst({
    where: { userId, kind: "DAILY", completedAt: null, startedAt: { gte: startOfDay(new Date()) } },
    orderBy: { startedAt: "desc" },
  });
}

// ─── Sessions ─────────────────────────────────────────────────────────────────

export interface CreateSessionInput {
  kind: SessionKind;
  lessonId?: string;
  knowledgeItemIds?: string[];
  listening?: boolean;
  /** Session quotidienne supplémentaire : révisions dues uniquement, aucune nouveauté. */
  reviewsOnly?: boolean;
}

export async function createSession(input: CreateSessionInput): Promise<{ id: string; count: number }> {
  const user = await getUser();
  const now = new Date();

  if (input.kind === "DAILY") {
    const resumable = await findResumableSession(user.id);
    if (resumable && resumable.kind === "DAILY") {
      const plan = PlanSchema.safeParse(resumable.plan);
      if (plan.success && resumable.currentIndex < plan.data.length) return { id: resumable.id, count: plan.data.length };
    }
  }

  const [items, introduced] = await Promise.all([
    loadPlanItems(user.id),
    input.kind === "DAILY" ? newIntroducedToday(user.id, now) : Promise.resolve(0),
  ]);
  let focusIds: Set<string> | undefined;
  if (input.kind === "LESSON" && input.lessonId) {
    const links = await prisma.lessonKnowledge.findMany({ where: { lessonId: input.lessonId }, select: { knowledgeItemId: true } });
    focusIds = new Set(links.map((l) => l.knowledgeItemId));
  } else if (input.kind === "KNOWLEDGE") {
    focusIds = new Set(input.knowledgeItemIds ?? []);
  } else if (input.kind === "PREPARATION") {
    const last = await prisma.lesson.findFirst({
      where: { userId: user.id, kind: "COURSE", processingStatus: "VALIDATED" },
      orderBy: { date: "desc" },
      include: { knowledge: { select: { knowledgeItemId: true } } },
    });
    focusIds = new Set(last?.knowledge.map((k) => k.knowledgeItemId) ?? []);
  }

  const plan = buildPlan(items, {
    now,
    kind: input.kind,
    maxReviews: input.kind === "PREPARATION" ? 15 : input.kind === "DAILY" ? sessionSize(user) : 25,
    newItems:
      input.kind === "DAILY"
        ? dailyNewBudget({ perSession: user.newItemsPerSession, perDay: user.newItemsPerDay, introducedToday: introduced, reviewsOnly: input.reviewsOnly })
        : user.newItemsPerSession,
    listening: input.listening ?? true,
    focusIds,
  });
  if (plan.length === 0) {
    throw new ReviewError(input.reviewsOnly ? "Plus aucune révision due aujourd'hui : tu peux t'arrêter là." : "Rien à réviser pour le moment.");
  }

  const session = await prisma.learningSession.create({
    data: { userId: user.id, kind: input.kind, plan: json(plan) },
  });
  return { id: session.id, count: plan.length };
}

export interface SessionView {
  id: string;
  kind: SessionKind;
  index: number;
  total: number;
  completed: boolean;
  exercise: PublicExercise | null;
  stats: { reviews: number; correct: number; mistakes: number };
  /** Arrêt conseillé (réponses qui se dégradent, durée largement dépassée), sinon null. */
  suggestStop: StopReason | null;
}

async function loadSession(sessionId: string) {
  const session = await prisma.learningSession.findUnique({ where: { id: sessionId } });
  if (!session) throw new ReviewError("Session introuvable.");
  const plan = PlanSchema.safeParse(session.plan);
  if (!plan.success) throw new ReviewError("Plan de session invalide.");
  return { session, plan: plan.data };
}

export async function getSessionView(sessionId: string): Promise<SessionView> {
  const { session, plan } = await loadSession(sessionId);
  const current = plan[session.currentIndex];
  const completed = !!session.completedAt || session.currentIndex >= plan.length;
  let suggestStop: StopReason | null = null;
  if (!completed && session.currentIndex > 0) {
    const attempts = await prisma.reviewAttempt.findMany({
      where: { sessionId },
      orderBy: { createdAt: "asc" },
      select: { knowledgeItemId: true, result: true, responseTimeMs: true },
    });
    const fresh = new Set(plan.filter((e) => e.reason === "new").map((e) => e.knowledgeItemId));
    suggestStop = stopSuggestion({
      results: attempts.filter((a) => a.result !== "SKIPPED" && !fresh.has(a.knowledgeItemId)).map((a) => a.result as Result),
      activeSeconds: Math.min(attempts.reduce((n, a) => n + activeMs(a.responseTimeMs), 0), Date.now() - session.startedAt.getTime()) / 1000,
      plannedSeconds: plannedSeconds(plan),
      remaining: plan.length - session.currentIndex,
    });
  }
  return {
    id: session.id,
    kind: session.kind,
    index: session.currentIndex,
    total: plan.length,
    completed,
    exercise: current && !session.completedAt ? toPublic(current) : null,
    stats: { reviews: session.reviewsCompleted, correct: session.correctCount, mistakes: session.mistakesCount },
    suggestStop,
  };
}

// ─── Réponses ─────────────────────────────────────────────────────────────────

export interface Reveal {
  expected: string;
  hanzi: string | null;
  pinyin: string | null;
  french: string | null;
  english: string | null;
  note: string | null;
  audioText: string | null;
}

export type SubmitOutcome =
  | {
      status: "final";
      result: Result;
      feedback: string | null;
      category: MistakeCategory | null;
      reveal: Reveal;
      mistakeRecurring: boolean;
      relearnQueued: boolean;
      next: SessionView;
    }
  | { status: "needs_judgment"; reveal: Reveal; aiAvailable: boolean };

function revealOf(spec: ExerciseSpec): Reveal {
  return {
    expected: spec.answer.expected,
    hanzi: spec.answer.hanzi,
    pinyin: spec.answer.pinyin,
    french: spec.answer.french,
    english: spec.answer.english,
    note: spec.answer.note,
    audioText: spec.answer.hanzi && !spec.answer.hanzi.includes("…") ? spec.answer.hanzi : null,
  };
}

export interface SubmitInput {
  index: number;
  answer: string;
  responseTimeMs?: number;
  dontKnow?: boolean;
  /** Jugement manuel après révélation (auto-évaluation). */
  selfResult?: "CORRECT" | "MOSTLY_CORRECT" | "INCORRECT";
  /** Demander l'évaluation à l'IA. */
  useAI?: boolean;
  /** Audio indisponible : l'exercice est passé sans pénalité. */
  skipUnavailable?: boolean;
}

export async function submitAnswer(sessionId: string, input: SubmitInput): Promise<SubmitOutcome> {
  const { session, plan } = await loadSession(sessionId);
  if (session.completedAt) throw new ReviewError("Cette session est terminée.");
  if (input.index !== session.currentIndex) throw new ReviewError("Cet exercice a déjà été traité.");
  const spec = plan[session.currentIndex];
  if (!spec) throw new ReviewError("Exercice introuvable.");
  const reveal = revealOf(spec);
  const answer = (input.answer ?? "").slice(0, 500);

  if (input.skipUnavailable) {
    return finalize(session.id, session.userId, plan, spec, {
      answer: "",
      result: "SKIPPED",
      method: "SELF",
      category: null,
      feedback: "Exercice passé (audio indisponible).",
      responseTimeMs: input.responseTimeMs,
      countAsReview: false,
    }, reveal);
  }

  if (input.dontKnow) {
    return finalize(session.id, session.userId, plan, spec, {
      answer: answer || "(je ne sais pas)",
      result: "INCORRECT",
      method: "SELF",
      category: null,
      feedback: null,
      responseTimeMs: input.responseTimeMs,
    }, reveal);
  }

  if (input.selfResult) {
    return finalize(session.id, session.userId, plan, spec, {
      answer,
      result: input.selfResult,
      method: "SELF",
      category: input.selfResult === "CORRECT" ? null : defaultCategory(spec.type),
      feedback: null,
      responseTimeMs: input.responseTimeMs,
    }, reveal);
  }

  if (input.useAI) {
    try {
      const ev = await evaluateAnswer({
        exerciseType: spec.type,
        question: `${spec.prompt.instruction} ${spec.prompt.display ?? spec.prompt.audioText ?? ""}`.trim(),
        expected: spec.answer.expected,
        alternatives: spec.answer.alternatives,
        userAnswer: answer,
        context: spec.answer.note ?? undefined,
      });
      return finalize(session.id, session.userId, plan, spec, {
        answer,
        result: ev.result,
        method: "AI",
        category: ev.result === "CORRECT" ? null : (ev.mistakeCategory ?? defaultCategory(spec.type)),
        feedback: [ev.explanation, ev.correctedAnswer && ev.result !== "CORRECT" ? `Correction : ${ev.correctedAnswer}` : null]
          .filter(Boolean)
          .join(" "),
        responseTimeMs: input.responseTimeMs,
      }, reveal);
    } catch (err) {
      throw new ReviewError(`${aiErrorMessage(err)} Tu peux t'auto-évaluer.`);
    }
  }

  const local = evaluateLocally(spec, answer);
  if (local.status === "needs_judgment") {
    const ai = await getAIStatus();
    return { status: "needs_judgment", reveal, aiAvailable: ai.available };
  }
  return finalize(session.id, session.userId, plan, spec, {
    answer,
    result: local.result,
    method: local.method,
    category: local.category,
    feedback: local.feedback,
    responseTimeMs: input.responseTimeMs,
  }, reveal);
}

interface Finalization {
  answer: string;
  result: Result;
  method: "EXACT" | "FUZZY" | "SELF" | "AI";
  category: MistakeCategory | null;
  feedback: string | null;
  responseTimeMs?: number;
  countAsReview?: boolean;
}

async function finalize(
  sessionId: string,
  userId: string,
  plan: ExerciseSpec[],
  spec: ExerciseSpec,
  f: Finalization,
  reveal: Reveal,
): Promise<SubmitOutcome> {
  const now = new Date();
  const promptText = [spec.prompt.instruction, spec.prompt.display ?? spec.prompt.audioText].filter(Boolean).join(" ");
  const countAsReview = f.countAsReview !== false;
  let mistakeRecurring = false;
  let relearnQueued = false;

  await prisma.$transaction(async (tx) => {
    const state = await tx.reviewState.upsert({
      where: { knowledgeItemId: spec.knowledgeItemId },
      create: { knowledgeItemId: spec.knowledgeItemId },
      update: {},
    });

    // Erreur : créée ou incrémentée (réouverte si elle avait été résolue).
    let mistakeId: string | null = null;
    const isWrong = (f.result === "INCORRECT" || f.result === "MOSTLY_CORRECT") && !!f.category;
    if (isWrong && f.category) {
      const existing = await tx.mistake.findUnique({
        where: { knowledgeItemId_category: { knowledgeItemId: spec.knowledgeItemId, category: f.category } },
      });
      if (existing) {
        const m = await tx.mistake.update({
          where: { id: existing.id },
          data: {
            occurrences: { increment: 1 },
            lastSeenAt: now,
            userAnswer: f.answer,
            expectedAnswer: spec.answer.expected,
            prompt: promptText,
            exerciseType: spec.type,
            explanation: f.feedback ?? existing.explanation,
            resolvedAt: null,
            reopenedCount: existing.resolvedAt ? { increment: 1 } : undefined,
          },
        });
        mistakeId = m.id;
        mistakeRecurring = m.occurrences >= 2;
      } else {
        const m = await tx.mistake.create({
          data: {
            userId,
            knowledgeItemId: spec.knowledgeItemId,
            category: f.category,
            exerciseType: spec.type,
            prompt: promptText,
            userAnswer: f.answer,
            expectedAnswer: spec.answer.expected,
            explanation: f.feedback,
          },
        });
        mistakeId = m.id;
      }
    }

    await tx.reviewAttempt.create({
      data: {
        userId,
        knowledgeItemId: spec.knowledgeItemId,
        sessionId,
        mistakeId,
        exerciseType: spec.type,
        dimension: spec.dimension,
        prompt: promptText,
        userAnswer: f.answer,
        expectedAnswer: spec.answer.expected,
        result: f.result,
        evaluationMethod: f.method,
        feedback: f.feedback,
        responseTimeMs: f.responseTimeMs ? Math.min(f.responseTimeMs, 30 * 60_000) : null,
      },
    });

    // Un exercice passé faute d'audio ne modifie ni la planification ni les scores.
    if (countAsReview) {
      // Planification : un exercice de réapprentissage réussi ne compte pas comme une nouvelle réussite espacée.
      const isRelearn = spec.reason === "relearn";
      const next =
        isRelearn && f.result !== "INCORRECT"
          ? { ...state, lastReviewAt: now }
          : schedule(
              {
                intervalDays: state.intervalDays,
                ease: state.ease,
                reps: state.reps,
                lapses: state.lapses,
                streak: state.streak,
                lastReviewAt: state.lastReviewAt,
                nextReviewAt: state.nextReviewAt,
              },
              f.result,
              { now, dimension: spec.dimension },
            );
      const scores = updateScores(
        {
          recognitionScore: state.recognitionScore,
          productionScore: state.productionScore,
          listeningScore: state.listeningScore,
          pronunciationScore: state.pronunciationScore,
          usageScore: state.usageScore,
        },
        spec.dimension,
        f.result,
      );
      {
        await tx.reviewState.update({
          where: { id: state.id },
          data: {
            intervalDays: next.intervalDays,
            ease: next.ease,
            reps: next.reps,
            lapses: next.lapses,
            streak: next.streak,
            lastReviewAt: next.lastReviewAt,
            // Réapprentissage réussi : l'élément revient au plus tôt demain (intervalle réduit par l'oubli).
            nextReviewAt:
              isRelearn && f.result !== "INCORRECT"
                ? new Date(now.getTime() + Math.max(1, state.intervalDays) * DAY_MS)
                : next.nextReviewAt,
            ...scores,
          },
        });
      }

      // Résolution automatique après plusieurs réussites consécutives.
      if (f.result === "CORRECT" && next.streak >= AUTO_RESOLVE_STREAK) {
        await tx.mistake.updateMany({
          where: { knowledgeItemId: spec.knowledgeItemId, resolvedAt: null },
          data: { resolvedAt: now },
        });
      }
    }

    // Réapprentissage : l'élément raté revient plus loin dans la session (une seule fois).
    const newPlan = [...plan];
    if (f.result === "INCORRECT" && spec.reason !== "relearn") {
      const again = plan.filter((p) => p.knowledgeItemId === spec.knowledgeItemId && p.reason === "relearn").length;
      if (again === 0) {
        const relearn: ExerciseSpec = { ...spec, key: `${spec.key}:relearn`, reason: "relearn" };
        const insertAt = Math.min(newPlan.length, plan.indexOf(spec) + 4);
        newPlan.splice(insertAt, 0, relearn);
        relearnQueued = true;
      }
    }

    await tx.learningSession.update({
      where: { id: sessionId },
      data: {
        plan: relearnQueued ? json(newPlan) : undefined,
        currentIndex: { increment: 1 },
        reviewsCompleted: countAsReview ? { increment: 1 } : undefined,
        correctCount: f.result === "CORRECT" ? { increment: 1 } : undefined,
        mistakesCount: mistakeId ? { increment: 1 } : undefined,
      },
    });
  });

  return {
    status: "final",
    result: f.result,
    feedback: f.feedback,
    category: f.category,
    reveal,
    mistakeRecurring,
    relearnQueued,
    next: await getSessionView(sessionId),
  };
}

export async function completeSession(sessionId: string) {
  const { session } = await loadSession(sessionId);
  if (session.completedAt) return getSessionSummary(sessionId);
  const attempts = await prisma.reviewAttempt.findMany({ where: { sessionId }, select: { responseTimeMs: true } });
  // Temps actif : temps de réponse plafonné + lecture de la correction.
  const active = attempts.reduce((s, a) => s + activeMs(a.responseTimeMs), 0);
  const wall = Date.now() - session.startedAt.getTime();
  await prisma.learningSession.update({
    where: { id: sessionId },
    data: { completedAt: new Date(), durationSeconds: Math.round(Math.min(active, wall) / 1000) },
  });
  return getSessionSummary(sessionId);
}

export interface SessionSummary {
  id: string;
  kind: SessionKind;
  reviews: number;
  correct: number;
  mistakes: number;
  durationSeconds: number;
  completed: boolean;
  /** Exercices non faits (session arrêtée avant la fin) : ils reviendront lors des prochaines sessions. */
  remaining: number;
  items: {
    knowledgeItemId: string;
    label: string;
    /** Pire résultat obtenu dans la session. */
    result: Result;
    exerciseType: ExerciseType;
    nextReviewAt: Date | null;
  }[];
}

export async function getSessionSummary(sessionId: string): Promise<SessionSummary> {
  const session = await prisma.learningSession.findUnique({
    where: { id: sessionId },
    include: {
      attempts: {
        orderBy: { createdAt: "asc" },
        include: {
          knowledgeItem: { include: { vocabulary: true, sentence: true, grammarPoint: true, reviewState: true } },
        },
      },
    },
  });
  if (!session) throw new ReviewError("Session introuvable.");
  const RANK: Record<Result, number> = { CORRECT: 0, SKIPPED: 1, MOSTLY_CORRECT: 2, INCORRECT: 3 };
  const worstByItem = new Map<string, (typeof session.attempts)[number]>();
  for (const a of session.attempts) {
    const prev = worstByItem.get(a.knowledgeItemId);
    if (!prev || RANK[a.result] > RANK[prev.result]) worstByItem.set(a.knowledgeItemId, a);
  }
  return {
    id: session.id,
    kind: session.kind,
    reviews: session.reviewsCompleted,
    correct: session.correctCount,
    mistakes: session.mistakesCount,
    durationSeconds: session.durationSeconds,
    completed: !!session.completedAt,
    remaining: Math.max(0, (PlanSchema.safeParse(session.plan).data?.length ?? 0) - session.currentIndex),
    items: [...worstByItem.values()].map((a) => {
      const k = a.knowledgeItem;
      return {
        knowledgeItemId: k.id,
        label: k.vocabulary?.hanzi ?? k.sentence?.hanzi ?? k.grammarPoint?.name ?? "?",
        result: a.result,
        exerciseType: a.exerciseType as ExerciseType,
        nextReviewAt: k.reviewState?.nextReviewAt ?? null,
      };
    }),
  };
}

// ─── Préparation du prochain cours ────────────────────────────────────────────

export interface PreparationBrief {
  lessonTitle: string | null;
  lessonDate: Date | null;
  grammar: { id: string; name: string; structure: string | null }[];
  fragile: { id: string; label: string; pinyin: string | null; meaning: string | null }[];
  recurringMistakes: { id: string; label: string; category: string }[];
  questions: string[];
}

/** Ce qu'il faut avoir en tête pour réutiliser le dernier cours en classe. */
export async function getPreparationBrief(sessionId?: string): Promise<PreparationBrief> {
  const user = await getUser();
  const last = await prisma.lesson.findFirst({
    where: { userId: user.id, kind: "COURSE", processingStatus: "VALIDATED" },
    orderBy: { date: "desc" },
    include: {
      knowledge: { include: { knowledgeItem: { include: { vocabulary: true, grammarPoint: true, reviewState: true } } } },
      exercises: { where: { type: "SPEAKING" }, take: 3, orderBy: { sourcePage: "asc" } },
    },
  });
  const failedInSession = sessionId
    ? new Set(
        (await prisma.reviewAttempt.findMany({ where: { sessionId, result: { in: ["INCORRECT", "MOSTLY_CORRECT"] } }, select: { knowledgeItemId: true } })).map(
          (a) => a.knowledgeItemId,
        ),
      )
    : new Set<string>();
  const items = last?.knowledge.map((k) => k.knowledgeItem) ?? [];
  const fragile = items
    .filter((k) => k.vocabulary && (failedInSession.has(k.id) || (k.reviewState?.productionScore ?? 0) < 60))
    .sort((a, b) => Number(failedInSession.has(b.id)) - Number(failedInSession.has(a.id)))
    .slice(0, 8)
    .map((k) => ({ id: k.id, label: k.vocabulary!.hanzi, pinyin: k.vocabulary!.pinyin, meaning: k.vocabulary!.french ?? k.vocabulary!.english }));
  const recurring = await prisma.mistake.findMany({
    where: { userId: user.id, resolvedAt: null, occurrences: { gte: 2 } },
    include: { knowledgeItem: { include: { vocabulary: true, sentence: true, grammarPoint: true } } },
    orderBy: { occurrences: "desc" },
    take: 5,
  });
  return {
    lessonTitle: last?.title ?? null,
    lessonDate: last?.date ?? null,
    grammar: items.filter((k) => k.grammarPoint).map((k) => ({ id: k.id, name: k.grammarPoint!.name, structure: k.grammarPoint!.structure })),
    fragile,
    recurringMistakes: recurring.map((m) => ({
      id: m.knowledgeItemId,
      label: m.knowledgeItem.vocabulary?.hanzi ?? m.knowledgeItem.sentence?.hanzi ?? m.knowledgeItem.grammarPoint?.name ?? "?",
      category: m.category,
    })),
    questions: last?.exercises.map((e) => e.prompt) ?? [],
  };
}
