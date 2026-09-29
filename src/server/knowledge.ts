import "server-only";
import type { KnowledgeType, Prisma, SourceType } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { masteryOf, type MasteryLevel } from "@/lib/review/mastery";
import { canonicalKey, containsHanzi } from "@/lib/chinese/text";
import { toneless, looksLikePinyin } from "@/lib/chinese/pinyin";
import { getUserId } from "./user";

export type KnowledgeFilter = "all" | "vocabulary" | "expression" | "sentence" | "grammar" | "weak" | "mastered" | "new";

export interface KnowledgeListItem {
  id: string;
  type: KnowledgeType;
  sourceType: SourceType;
  primary: string;
  pinyin: string | null;
  meaning: string | null;
  meaningIsEnglish: boolean;
  mastery: MasteryLevel;
  nextReviewAt: Date | null;
  activeMistakes: number;
  lessonCount: number;
  lastLessonTitle: string | null;
}

const include = {
  vocabulary: true,
  sentence: true,
  grammarPoint: true,
  reviewState: true,
  mistakes: { where: { resolvedAt: null }, select: { occurrences: true } },
  lessons: { include: { lesson: { select: { title: true, date: true } } } },
} satisfies Prisma.KnowledgeItemInclude;

type Row = Prisma.KnowledgeItemGetPayload<{ include: typeof include }>;

function toListItem(k: Row): KnowledgeListItem {
  const s = k.reviewState;
  const activeMistakes = k.mistakes.reduce((n, m) => n + m.occurrences, 0);
  const primary = k.vocabulary?.hanzi ?? k.sentence?.hanzi ?? k.grammarPoint?.name ?? "";
  const french = k.vocabulary?.french ?? k.sentence?.french ?? k.grammarPoint?.french ?? k.grammarPoint?.explanation ?? null;
  const english = k.vocabulary?.english ?? k.sentence?.english ?? null;
  const last = [...k.lessons].sort((a, b) => b.lesson.date.getTime() - a.lesson.date.getTime())[0];
  return {
    id: k.id,
    type: k.type,
    sourceType: k.sourceType,
    primary,
    pinyin: k.vocabulary?.pinyin ?? k.sentence?.pinyin ?? k.grammarPoint?.structure ?? null,
    meaning: french ?? english,
    meaningIsEnglish: !french && !!english,
    mastery: masteryOf(s, k.mistakes),
    nextReviewAt: s?.nextReviewAt ?? null,
    activeMistakes,
    lessonCount: k.lessons.length,
    lastLessonTitle: last?.lesson.title ?? null,
  };
}

function matchesQuery(item: Row, q: string): boolean {
  const query = q.trim().toLowerCase();
  if (!query) return true;
  const fields = [
    item.vocabulary?.hanzi,
    item.vocabulary?.french,
    item.vocabulary?.english,
    item.vocabulary?.notes,
    item.sentence?.hanzi,
    item.sentence?.french,
    item.sentence?.english,
    item.grammarPoint?.name,
    item.grammarPoint?.structure,
    item.grammarPoint?.explanation,
  ].filter((f): f is string => !!f);
  const plain = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  if (fields.some((f) => plain(f).includes(plain(query)))) return true;
  if (!containsHanzi(query) && looksLikePinyin(query)) {
    const qp = toneless(query);
    const pinyins = [item.vocabulary?.pinyin, item.sentence?.pinyin].filter((p): p is string => !!p);
    if (qp && pinyins.some((p) => toneless(p).includes(qp))) return true;
  }
  return false;
}

export async function listKnowledge(filter: KnowledgeFilter = "all", q = ""): Promise<KnowledgeListItem[]> {
  const userId = await getUserId();
  const where: Prisma.KnowledgeItemWhereInput = { userId };
  if (filter === "vocabulary") where.type = "VOCABULARY";
  if (filter === "expression") where.type = "EXPRESSION";
  if (filter === "sentence") where.type = "SENTENCE";
  if (filter === "grammar") where.type = "GRAMMAR";
  const rows = await prisma.knowledgeItem.findMany({ where, include, orderBy: { createdAt: "desc" } });
  let items = rows.filter((r) => matchesQuery(r, q)).map(toListItem);
  if (filter === "weak") items = items.filter((i) => i.mastery === "WEAK" || i.activeMistakes > 0);
  if (filter === "mastered") items = items.filter((i) => i.mastery === "MASTERED" || i.mastery === "CONSOLIDATED");
  if (filter === "new") items = items.filter((i) => i.mastery === "NEW");
  return items;
}

/** Connaissances d'une liste d'identifiants (ex. un thème), dans le format de la liste. */
export async function listKnowledgeByIds(ids: string[]): Promise<KnowledgeListItem[]> {
  const userId = await getUserId();
  const rows = await prisma.knowledgeItem.findMany({ where: { userId, id: { in: ids } }, include, orderBy: { createdAt: "desc" } });
  return rows.map(toListItem);
}

export async function getKnowledgeDetail(id: string) {
  const item = await prisma.knowledgeItem.findUnique({
    where: { id },
    include: {
      vocabulary: true,
      sentence: true,
      grammarPoint: true,
      reviewState: true,
      examples: { orderBy: { createdAt: "asc" } },
      lessons: { include: { lesson: { select: { id: true, title: true, date: true, kind: true } } }, orderBy: { createdAt: "asc" } },
      mistakes: { orderBy: { lastSeenAt: "desc" } },
      attempts: { orderBy: { createdAt: "desc" }, take: 30 },
      corrections: { include: { lesson: { select: { id: true, title: true } } } },
      themes: { include: { theme: { select: { id: true, name: true, emoji: true } } }, orderBy: { createdAt: "asc" } },
    },
  });
  if (!item) return null;
  const firstLesson = [...item.lessons].sort((a, b) => a.lesson.date.getTime() - b.lesson.date.getTime())[0];
  const attemptsByDimension = item.attempts.reduce<Record<string, number>>((acc, a) => {
    acc[a.dimension] = (acc[a.dimension] ?? 0) + 1;
    return acc;
  }, {});
  return { item, firstLesson, attemptsByDimension };
}

// ─── Modifications utilisateur ────────────────────────────────────────────────

export interface KnowledgeEdit {
  hanzi?: string;
  pinyin?: string | null;
  french?: string | null;
  english?: string | null;
  notes?: string | null;
  name?: string;
  structure?: string | null;
  explanation?: string | null;
}

const clean = (v: string | null | undefined) => (v === undefined ? undefined : v?.trim() || null);

/** Modifie une connaissance ; les champs modifiés passent en provenance USER. */
export async function updateKnowledge(id: string, edit: KnowledgeEdit) {
  const item = await prisma.knowledgeItem.findUnique({ where: { id }, include: { vocabulary: true, sentence: true, grammarPoint: true } });
  if (!item) throw new Error("Connaissance introuvable.");
  const changed = <T>(next: T | undefined, prev: T | null | undefined) => next !== undefined && next !== (prev ?? null);

  if (item.vocabulary) {
    const v = item.vocabulary;
    const hanzi = clean(edit.hanzi) ?? v.hanzi;
    const pinyin = clean(edit.pinyin);
    const french = clean(edit.french);
    const english = clean(edit.english);
    await prisma.$transaction([
      prisma.vocabulary.update({
        where: { knowledgeItemId: id },
        data: {
          hanzi,
          ...(changed(pinyin, v.pinyin) ? { pinyin, pinyinSource: "USER" as const } : {}),
          ...(changed(french, v.french) ? { french, frenchSource: "USER" as const } : {}),
          ...(changed(english, v.english) ? { english, englishSource: "USER" as const } : {}),
          ...(edit.notes !== undefined ? { notes: clean(edit.notes) } : {}),
        },
      }),
      prisma.knowledgeItem.update({ where: { id }, data: { canonicalKey: canonicalKey(item.type, hanzi) } }),
    ]);
  } else if (item.sentence) {
    const s = item.sentence;
    const hanzi = clean(edit.hanzi) ?? s.hanzi;
    const pinyin = clean(edit.pinyin);
    const french = clean(edit.french);
    const english = clean(edit.english);
    await prisma.$transaction([
      prisma.sentence.update({
        where: { knowledgeItemId: id },
        data: {
          hanzi,
          ...(changed(pinyin, s.pinyin) ? { pinyin, pinyinSource: "USER" as const } : {}),
          ...(changed(french, s.french) ? { french, frenchSource: "USER" as const } : {}),
          ...(changed(english, s.english) ? { english, englishSource: "USER" as const } : {}),
          ...(edit.notes !== undefined ? { notes: clean(edit.notes) } : {}),
        },
      }),
      prisma.knowledgeItem.update({ where: { id }, data: { canonicalKey: canonicalKey("SENTENCE", hanzi) } }),
    ]);
  } else if (item.grammarPoint) {
    const g = item.grammarPoint;
    const name = clean(edit.name) ?? g.name;
    const explanation = clean(edit.explanation);
    const french = clean(edit.french);
    await prisma.$transaction([
      prisma.grammarPoint.update({
        where: { knowledgeItemId: id },
        data: {
          name,
          ...(edit.structure !== undefined ? { structure: clean(edit.structure) } : {}),
          ...(changed(explanation, g.explanation) ? { explanation, explanationSource: "USER" as const } : {}),
          ...(changed(french, g.french) ? { french, frenchSource: "USER" as const } : {}),
          ...(edit.notes !== undefined ? { notes: clean(edit.notes) } : {}),
        },
      }),
      prisma.knowledgeItem.update({ where: { id }, data: { canonicalKey: canonicalKey("GRAMMAR", name) } }),
    ]);
  }
}

/** Suspendre / réactiver une connaissance (exclue des sessions, historique conservé). */
export async function setKnowledgeSuspended(id: string, suspended: boolean) {
  await prisma.knowledgeItem.update({ where: { id }, data: { status: suspended ? "SUSPENDED" : "ACTIVE" } });
}
