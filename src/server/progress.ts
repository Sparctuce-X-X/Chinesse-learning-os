import "server-only";
import { prisma } from "@/lib/db/prisma";
import { masteryOf } from "@/lib/review/mastery";
import { DAY_MS, endOfDay, startOfDay } from "@/lib/review/scheduler";
import { getUserId } from "./user";

export interface WeekStats {
  daysStudied: number;
  sessions: number;
  reviews: number;
  minutes: number;
  speakingMinutes: number;
  consolidated: number;
  recallRate: number | null;
}

export interface ProgressData {
  week: WeekStats;
  previousWeek: WeekStats;
  allTime: { daysStudied: number; sessions: number; reviews: number; minutes: number; knowledge: number; learned: number };
  due: { today: number; week: number };
  recurringMistakes: number;
  productionRetention: { eligible: number; recalled: number };
  dimensions: { label: string; average: number; tested: number }[];
  daily: { date: string; reviews: number; correct: number }[];
}

async function weekStats(userId: string, from: Date, to: Date): Promise<WeekStats> {
  const [sessions, attempts, speaking, consolidated] = await Promise.all([
    prisma.learningSession.findMany({ where: { userId, completedAt: { gte: from, lt: to } }, select: { durationSeconds: true, completedAt: true } }),
    prisma.reviewAttempt.findMany({ where: { userId, createdAt: { gte: from, lt: to } }, select: { result: true, createdAt: true } }),
    prisma.speakingAttempt.findMany({ where: { userId, createdAt: { gte: from, lt: to } }, select: { durationSeconds: true, createdAt: true } }),
    // Notions révisées sur la période et consolidées (ou maîtrisées) selon la même règle que les fiches.
    prisma.reviewState.findMany({
      where: { knowledgeItem: { userId, status: "ACTIVE" }, intervalDays: { gte: 7 }, lastReviewAt: { gte: from, lt: to } },
      include: { knowledgeItem: { select: { mistakes: { where: { resolvedAt: null }, select: { occurrences: true } } } } },
    }),
  ]);
  const days = new Set<string>();
  attempts.forEach((a) => days.add(a.createdAt.toDateString()));
  speaking.forEach((s) => days.add(s.createdAt.toDateString()));
  const graded = attempts.filter((a) => a.result !== "SKIPPED");
  const ok = graded.filter((a) => a.result === "CORRECT" || a.result === "MOSTLY_CORRECT").length;
  return {
    daysStudied: days.size,
    sessions: sessions.length,
    reviews: graded.length,
    minutes: Math.round(sessions.reduce((s, x) => s + x.durationSeconds, 0) / 60),
    speakingMinutes: Math.round(speaking.reduce((s, x) => s + (x.durationSeconds ?? 0), 0) / 60),
    consolidated: consolidated.filter((st) => ["CONSOLIDATED", "MASTERED"].includes(masteryOf(st, st.knowledgeItem.mistakes))).length,
    recallRate: graded.length ? Math.round((ok / graded.length) * 100) : null,
  };
}

export async function getProgress(): Promise<ProgressData> {
  const userId = await getUserId();
  const now = new Date();
  const weekStart = startOfDay(new Date(now.getTime() - 6 * DAY_MS));
  const prevStart = new Date(weekStart.getTime() - 7 * DAY_MS);
  const tomorrow = new Date(endOfDay(now).getTime() + 1);

  const [week, previousWeek, sessions, attempts, knowledge, states, recurringMistakes, dueToday, dueWeek, prodAttempts] =
    await Promise.all([
      weekStats(userId, weekStart, tomorrow),
      weekStats(userId, prevStart, weekStart),
      prisma.learningSession.findMany({ where: { userId, completedAt: { not: null } }, select: { durationSeconds: true } }),
      prisma.reviewAttempt.findMany({ where: { userId }, select: { createdAt: true, result: true } }),
      prisma.knowledgeItem.count({ where: { userId, status: "ACTIVE" } }),
      prisma.reviewState.findMany({ where: { knowledgeItem: { userId, status: "ACTIVE" } } }),
      prisma.mistake.count({ where: { userId, resolvedAt: null, occurrences: { gte: 2 } } }),
      prisma.reviewState.count({ where: { knowledgeItem: { userId, status: "ACTIVE" }, nextReviewAt: { lte: endOfDay(now) } } }),
      prisma.reviewState.count({
        where: { knowledgeItem: { userId, status: "ACTIVE" }, nextReviewAt: { lte: endOfDay(new Date(now.getTime() + 6 * DAY_MS)) } },
      }),
      // Indicateur principal : production réussie sur des notions apprises il y a plus de 3 semaines.
      prisma.reviewAttempt.findMany({
        where: {
          userId,
          dimension: "PRODUCTION",
          createdAt: { gte: new Date(now.getTime() - 30 * DAY_MS) },
          knowledgeItem: { createdAt: { lte: new Date(now.getTime() - 21 * DAY_MS) } },
        },
        orderBy: { createdAt: "desc" },
        select: { knowledgeItemId: true, result: true },
      }),
    ]);

  const days = new Set(attempts.map((a) => a.createdAt.toDateString()));
  const lastProd = new Map<string, string>();
  for (const a of prodAttempts) if (!lastProd.has(a.knowledgeItemId)) lastProd.set(a.knowledgeItemId, a.result);

  const tested = (field: "recognitionScore" | "productionScore" | "listeningScore" | "pronunciationScore" | "usageScore") =>
    states.filter((s) => s[field] > 0);
  const dim = (label: string, field: Parameters<typeof tested>[0]) => {
    const t = tested(field);
    return { label, tested: t.length, average: t.length ? Math.round(t.reduce((n, s) => n + s[field], 0) / t.length) : 0 };
  };

  const daily: ProgressData["daily"] = [];
  for (let i = 13; i >= 0; i--) {
    const d = startOfDay(new Date(now.getTime() - i * DAY_MS));
    const key = d.toDateString();
    const dayAttempts = attempts.filter((a) => a.createdAt.toDateString() === key && a.result !== "SKIPPED");
    daily.push({
      date: d.toISOString().slice(0, 10),
      reviews: dayAttempts.length,
      correct: dayAttempts.filter((a) => a.result === "CORRECT").length,
    });
  }

  return {
    week,
    previousWeek,
    allTime: {
      daysStudied: days.size,
      sessions: sessions.length,
      reviews: attempts.filter((a) => a.result !== "SKIPPED").length,
      minutes: Math.round(sessions.reduce((s, x) => s + x.durationSeconds, 0) / 60),
      knowledge,
      learned: states.filter((s) => s.reps > 0).length,
    },
    due: { today: dueToday, week: dueWeek },
    recurringMistakes,
    productionRetention: {
      eligible: lastProd.size,
      recalled: [...lastProd.values()].filter((r) => r === "CORRECT" || r === "MOSTLY_CORRECT").length,
    },
    dimensions: [
      dim("Reconnaissance", "recognitionScore"),
      dim("Production", "productionScore"),
      dim("Écoute", "listeningScore"),
      dim("Prononciation", "pronunciationScore"),
      dim("Usage", "usageScore"),
    ],
    daily,
  };
}
