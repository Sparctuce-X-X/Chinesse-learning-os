import "server-only";
import type { SourceType } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { getAIStatus } from "@/lib/ai";
import { classifyThemes } from "@/lib/ai/tasks";
import { aiErrorMessage } from "@/lib/ai/types";
import { logError } from "@/lib/log";
import { masteryOf } from "@/lib/review/mastery";
import { endOfDay } from "@/lib/review/scheduler";
import { getUserId } from "./user";

/**
 * Thèmes : regroupement transversal des connaissances par sujet de conversation.
 * - Rangement automatique par l'IA des éléments jamais rangés (après chaque cours validé).
 * - Incrémental : les thèmes existants sont réutilisés, les choix de l'utilisateur ne sont jamais écrasés.
 * - La grammaire n'est pas rangée par thème (elle a sa propre section).
 */

export class ThemeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ThemeError";
  }
}

const BATCH_SIZE = 70;
const CLASSIFIABLE = ["VOCABULARY", "EXPRESSION", "SENTENCE"] as const;

export function normalizeThemeName(raw: string): string {
  const s = raw.normalize("NFC").replace(/\s+/g, " ").trim().slice(0, 40);
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ─── Rangement automatique ────────────────────────────────────────────────────

export interface ClassifyState {
  running: boolean;
  lastError: string | null;
  lastRunAt: Date | null;
  lastClassified: number;
}

const g = globalThis as unknown as { __themeJob?: { state: ClassifyState; promise: Promise<void> | null; again: boolean } };
function job() {
  if (!g.__themeJob) g.__themeJob = { state: { running: false, lastError: null, lastRunAt: null, lastClassified: 0 }, promise: null, again: false };
  return g.__themeJob;
}

export function getClassifyState(): ClassifyState {
  return { ...job().state };
}

export async function countUnclassified(userId?: string): Promise<number> {
  const uid = userId ?? (await getUserId());
  return prisma.knowledgeItem.count({ where: { userId: uid, type: { in: [...CLASSIFIABLE] }, themesClassifiedAt: null } });
}

/**
 * Range les éléments pas encore rangés. Une seule exécution à la fois : un appel pendant
 * une exécution en programme une nouvelle à la fin (les éléments ajoutés entre-temps sont traités).
 */
export function classifyPendingThemes(): Promise<void> {
  const j = job();
  if (j.promise) {
    j.again = true;
    return j.promise;
  }
  j.state.running = true;
  j.promise = (async () => {
    try {
      do {
        j.again = false;
        await runClassification();
      } while (j.again);
      j.state.lastError = null;
    } catch (err) {
      j.state.lastError = err instanceof ThemeError ? err.message : aiErrorMessage(err);
      logError("themes:classify", err);
    } finally {
      j.state.running = false;
      j.state.lastRunAt = new Date();
      j.promise = null;
    }
  })();
  return j.promise;
}

async function runClassification(): Promise<void> {
  const userId = await getUserId();
  const status = await getAIStatus();
  if (!status.available) throw new ThemeError(`Le rangement par thème nécessite l'IA (${status.reason ?? "indisponible"}).`);
  job().state.lastClassified = 0;

  for (;;) {
    const rows = await prisma.knowledgeItem.findMany({
      where: { userId, type: { in: [...CLASSIFIABLE] }, themesClassifiedAt: null },
      include: {
        vocabulary: true,
        sentence: true,
        lessons: { include: { lesson: { select: { topics: true } } } },
      },
      orderBy: { createdAt: "asc" },
      take: BATCH_SIZE,
    });
    if (rows.length === 0) return;

    const themes = await prisma.theme.findMany({ where: { userId }, include: { _count: { select: { items: true } } } });
    // Identifiants courts : moins de texte et aucun risque de confusion d'identifiants par l'IA.
    const shortIds = new Map(rows.map((r, i) => [`e${i + 1}`, r.id]));
    const result = await classifyThemes({
      existingThemes: themes.map((t) => ({ name: t.name, description: t.description, count: t._count.items })),
      items: rows.map((r, i) => ({
        id: `e${i + 1}`,
        type: r.type,
        hanzi: r.vocabulary?.hanzi ?? r.sentence?.hanzi ?? "",
        pinyin: r.vocabulary?.pinyin ?? r.sentence?.pinyin ?? null,
        meaning: r.vocabulary?.french ?? r.vocabulary?.english ?? r.sentence?.french ?? r.sentence?.english ?? null,
        lessonTopics: [...new Set(r.lessons.flatMap((l) => (Array.isArray(l.lesson.topics) ? (l.lesson.topics as unknown[]).map(String) : [])))].slice(0, 5),
      })),
    });

    await prisma.$transaction(async (tx) => {
      const byName = new Map(themes.map((t) => [t.name.toLowerCase(), t.id]));
      const meta = new Map(result.newThemes.map((t) => [normalizeThemeName(t.name).toLowerCase(), t]));
      const themeId = async (raw: string): Promise<string | null> => {
        const name = normalizeThemeName(raw);
        if (!name) return null;
        const key = name.toLowerCase();
        const found = byName.get(key);
        if (found) return found;
        const m = meta.get(key);
        const created = await tx.theme.create({
          data: { userId, name, emoji: m?.emoji?.trim() || null, description: m?.description?.trim() || null, source: "AI" },
        });
        byName.set(key, created.id);
        return created.id;
      };
      for (const a of result.assignments) {
        const itemId = shortIds.get(a.id);
        if (!itemId) continue;
        for (const name of a.themes.slice(0, 2)) {
          const id = await themeId(name);
          if (!id) continue;
          await tx.knowledgeTheme.upsert({
            where: { knowledgeItemId_themeId: { knowledgeItemId: itemId, themeId: id } },
            create: { knowledgeItemId: itemId, themeId: id, source: "AI" },
            update: {},
          });
        }
      }
      // Tous les éléments du lot sont marqués rangés (ceux sans thème restent « Non classés »,
      // à ranger à la main) : on ne relance pas l'IA en boucle sur les mêmes éléments.
      await tx.knowledgeItem.updateMany({ where: { id: { in: rows.map((r) => r.id) } }, data: { themesClassifiedAt: new Date() } });
    }, { timeout: 30_000 });
    job().state.lastClassified += rows.length;
  }
}

// ─── Lecture ──────────────────────────────────────────────────────────────────

export interface ThemeSummary {
  id: string;
  name: string;
  emoji: string | null;
  description: string | null;
  source: SourceType;
  total: number;
  learned: number;
  due: number;
  weak: number;
  isNew: number;
  lastAddedAt: Date | null;
}

function progressOf(k: {
  reviewState: { reps: number; intervalDays: number; lapses: number; productionScore: number; recognitionScore: number; nextReviewAt: Date | null } | null;
  mistakes: { occurrences: number }[];
}) {
  const s = k.reviewState;
  const level = masteryOf(s, k.mistakes);
  return { level, due: !!s?.nextReviewAt && s.reps > 0 && s.nextReviewAt <= endOfDay(new Date()) };
}

export async function listThemes(): Promise<{ themes: ThemeSummary[]; unclassified: number; unthemed: number }> {
  const userId = await getUserId();
  const themes = await prisma.theme.findMany({
    where: { userId },
    include: {
      items: {
        where: { knowledgeItem: { status: "ACTIVE" } },
        include: {
          knowledgeItem: {
            select: {
              reviewState: true,
              mistakes: { where: { resolvedAt: null }, select: { occurrences: true } },
            },
          },
        },
      },
    },
  });
  const summaries = themes.map((t): ThemeSummary => {
    let learned = 0;
    let due = 0;
    let weak = 0;
    let isNew = 0;
    for (const link of t.items) {
      const p = progressOf(link.knowledgeItem);
      if (p.level === "CONSOLIDATED" || p.level === "MASTERED") learned++;
      if (p.level === "WEAK") weak++;
      if (p.level === "NEW") isNew++;
      if (p.due) due++;
    }
    const lastAddedAt = t.items.reduce<Date | null>((d, l) => (!d || l.createdAt > d ? l.createdAt : d), null);
    return { id: t.id, name: t.name, emoji: t.emoji, description: t.description, source: t.source, total: t.items.length, learned, due, weak, isNew, lastAddedAt };
  });
  summaries.sort((a, b) => b.total - a.total || a.name.localeCompare(b.name, "fr"));
  const [unclassified, unthemed] = await Promise.all([
    countUnclassified(userId),
    prisma.knowledgeItem.count({
      where: { userId, type: { in: [...CLASSIFIABLE] }, themesClassifiedAt: { not: null }, themes: { none: {} } },
    }),
  ]);
  return { themes: summaries.filter((s) => s.total > 0 || s.source === "USER"), unclassified, unthemed };
}

export async function getTheme(id: string) {
  const userId = await getUserId();
  const theme = await prisma.theme.findFirst({
    where: { id, userId },
    include: {
      items: {
        include: {
          knowledgeItem: { select: { id: true, status: true, lessons: { select: { lesson: { select: { id: true, title: true, date: true, kind: true } } } } } },
        },
      },
    },
  });
  if (!theme) return null;
  const lessons = new Map<string, { id: string; title: string; date: Date; kind: "COURSE" | "RESOURCE"; count: number }>();
  for (const l of theme.items)
    for (const { lesson } of l.knowledgeItem.lessons) {
      const e = lessons.get(lesson.id) ?? { ...lesson, count: 0 };
      e.count++;
      lessons.set(lesson.id, e);
    }
  return {
    theme,
    itemIds: theme.items.map((l) => l.knowledgeItemId),
    activeIds: theme.items.filter((l) => l.knowledgeItem.status === "ACTIVE").map((l) => l.knowledgeItemId),
    linkSource: new Map(theme.items.map((l) => [l.knowledgeItemId, l.source])),
    lessons: [...lessons.values()].sort((a, b) => b.date.getTime() - a.date.getTime()),
  };
}

/** Éléments rangés sans aucun thème (à ranger à la main). */
export async function listUnthemedIds(): Promise<string[]> {
  const userId = await getUserId();
  const rows = await prisma.knowledgeItem.findMany({
    where: { userId, type: { in: [...CLASSIFIABLE] }, themes: { none: {} } },
    select: { id: true },
  });
  return rows.map((r) => r.id);
}

export async function listThemeOptions(): Promise<{ id: string; name: string; emoji: string | null }[]> {
  const userId = await getUserId();
  return prisma.theme.findMany({ where: { userId }, select: { id: true, name: true, emoji: true }, orderBy: { name: "asc" } });
}

// ─── Modifications par l'utilisateur ──────────────────────────────────────────

async function ownTheme(id: string) {
  const userId = await getUserId();
  const t = await prisma.theme.findFirst({ where: { id, userId } });
  if (!t) throw new ThemeError("Thème introuvable.");
  return t;
}

async function assertUniqueName(name: string, exceptId?: string) {
  const userId = await getUserId();
  const other = await prisma.theme.findFirst({ where: { userId, name, NOT: exceptId ? { id: exceptId } : undefined } });
  if (other) throw new ThemeError(`Un thème « ${name} » existe déjà : fusionne-les plutôt.`);
}

export async function createTheme(input: { name: string; emoji?: string | null }): Promise<{ id: string }> {
  const name = normalizeThemeName(input.name);
  if (!name) throw new ThemeError("Donne un nom au thème.");
  await assertUniqueName(name);
  const t = await prisma.theme.create({ data: { userId: await getUserId(), name, emoji: input.emoji?.trim() || null, source: "USER" } });
  return { id: t.id };
}

export async function renameTheme(id: string, input: { name: string; emoji?: string | null; description?: string | null }) {
  await ownTheme(id);
  const name = normalizeThemeName(input.name);
  if (!name) throw new ThemeError("Donne un nom au thème.");
  await assertUniqueName(name, id);
  await prisma.theme.update({
    where: { id },
    data: { name, emoji: input.emoji?.trim() || null, description: input.description?.trim() || null, source: "USER" },
  });
}

/** Fusionne `sourceId` dans `targetId` : les éléments sont déplacés, le thème source supprimé. */
export async function mergeThemes(sourceId: string, targetId: string) {
  if (sourceId === targetId) throw new ThemeError("Choisis un autre thème.");
  await ownTheme(sourceId);
  await ownTheme(targetId);
  await prisma.$transaction(async (tx) => {
    const links = await tx.knowledgeTheme.findMany({ where: { themeId: sourceId } });
    for (const l of links) {
      await tx.knowledgeTheme.upsert({
        where: { knowledgeItemId_themeId: { knowledgeItemId: l.knowledgeItemId, themeId: targetId } },
        create: { knowledgeItemId: l.knowledgeItemId, themeId: targetId, source: l.source },
        update: {},
      });
    }
    await tx.theme.delete({ where: { id: sourceId } });
  });
}

/** Supprime le thème uniquement : les connaissances sont conservées. */
export async function deleteTheme(id: string) {
  await ownTheme(id);
  await prisma.theme.delete({ where: { id } });
}

export async function addItemToTheme(knowledgeItemId: string, themeId: string) {
  await ownTheme(themeId);
  const userId = await getUserId();
  const item = await prisma.knowledgeItem.findFirst({ where: { id: knowledgeItemId, userId }, select: { id: true } });
  if (!item) throw new ThemeError("Connaissance introuvable.");
  await prisma.$transaction([
    prisma.knowledgeTheme.upsert({
      where: { knowledgeItemId_themeId: { knowledgeItemId, themeId } },
      create: { knowledgeItemId, themeId, source: "USER" },
      update: { source: "USER" },
    }),
    // Rangé à la main : le rangement automatique ne le reprendra pas.
    prisma.knowledgeItem.update({ where: { id: knowledgeItemId }, data: { themesClassifiedAt: new Date() } }),
  ]);
}

export async function removeItemFromTheme(knowledgeItemId: string, themeId: string) {
  await ownTheme(themeId);
  await prisma.knowledgeTheme.deleteMany({ where: { knowledgeItemId, themeId } });
}

/** Remet des éléments dans la file du rangement automatique (ex. « Non classés »). */
export async function requeueForClassification(ids: string[]) {
  const userId = await getUserId();
  await prisma.knowledgeItem.updateMany({ where: { userId, id: { in: ids }, themes: { none: {} } }, data: { themesClassifiedAt: null } });
}
