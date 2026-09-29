import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { DAY_MS } from "@/lib/review/scheduler";
import { getUserId } from "./user";

export type MistakeSection = "todo" | "recurring" | "recent" | "resolved";

const include = {
  knowledgeItem: { include: { vocabulary: true, sentence: true, grammarPoint: true } },
} satisfies Prisma.MistakeInclude;

export type MistakeRow = Prisma.MistakeGetPayload<{ include: typeof include }>;

export const RECURRING_THRESHOLD = 2;

export async function listMistakes(section: MistakeSection): Promise<MistakeRow[]> {
  const userId = await getUserId();
  const where: Prisma.MistakeWhereInput = { userId };
  let orderBy: Prisma.MistakeOrderByWithRelationInput[] = [{ lastSeenAt: "desc" }];
  switch (section) {
    case "todo":
      where.resolvedAt = null;
      orderBy = [{ occurrences: "desc" }, { lastSeenAt: "desc" }];
      break;
    case "recurring":
      where.resolvedAt = null;
      where.occurrences = { gte: RECURRING_THRESHOLD };
      orderBy = [{ occurrences: "desc" }];
      break;
    case "recent":
      where.lastSeenAt = { gte: new Date(Date.now() - 7 * DAY_MS) };
      break;
    case "resolved":
      where.resolvedAt = { not: null };
      orderBy = [{ resolvedAt: "desc" }];
      break;
  }
  return prisma.mistake.findMany({ where, include, orderBy, take: 200 });
}

export async function mistakeCounts() {
  const userId = await getUserId();
  const [todo, recurring, recent, resolved] = await Promise.all([
    prisma.mistake.count({ where: { userId, resolvedAt: null } }),
    prisma.mistake.count({ where: { userId, resolvedAt: null, occurrences: { gte: RECURRING_THRESHOLD } } }),
    prisma.mistake.count({ where: { userId, lastSeenAt: { gte: new Date(Date.now() - 7 * DAY_MS) } } }),
    prisma.mistake.count({ where: { userId, resolvedAt: { not: null } } }),
  ]);
  return { todo, recurring, recent, resolved };
}

export async function resolveMistake(id: string) {
  await prisma.mistake.update({ where: { id }, data: { resolvedAt: new Date() } });
}

export async function reopenMistake(id: string) {
  await prisma.mistake.update({ where: { id }, data: { resolvedAt: null, reopenedCount: { increment: 1 } } });
}

export async function getMistakeHistory(id: string) {
  return prisma.reviewAttempt.findMany({ where: { mistakeId: id }, orderBy: { createdAt: "desc" }, take: 20 });
}

export const CATEGORY_LABEL: Record<string, string> = {
  MEANING: "Sens",
  CHARACTER: "Caractère",
  PINYIN: "Pinyin",
  TONE: "Ton",
  PRONUNCIATION: "Prononciation",
  GRAMMAR: "Grammaire",
  WORD_ORDER: "Ordre des mots",
  CLASSIFIER: "Classificateur",
  LISTENING: "Écoute",
  USAGE: "Usage",
  OTHER: "Autre",
};
