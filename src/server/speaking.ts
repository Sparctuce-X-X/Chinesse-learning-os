import "server-only";
import type { MistakeCategory, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { getAIStatus } from "@/lib/ai";
import { evaluateSpeaking } from "@/lib/ai/tasks";
import { aiErrorMessage } from "@/lib/ai/types";
import type { SpeakingFeedback } from "@/lib/ai/schemas";
import { normalizeHanzi } from "@/lib/chinese/text";
import { updateScores } from "@/lib/review/mastery";
import { getUserId } from "./user";

const json = (v: unknown) => v as Prisma.InputJsonValue;

export interface SpeakingTarget {
  knowledgeItemId: string;
  label: string;
  pinyin: string | null;
  meaning: string | null;
}

export interface SpeakingPrompt {
  key: string;
  kind: "TEACHER_QUESTION" | "USE_WORDS" | "GRAMMAR";
  questionHanzi: string | null;
  instructionFr: string;
  context: string | null;
  targets: SpeakingTarget[];
  lessonTitle: string | null;
  sourceType: "TEACHER" | "AI" | "USER" | "EXTERNAL";
}

type Item = Prisma.KnowledgeItemGetPayload<{
  include: { vocabulary: true; grammarPoint: true; reviewState: true; mistakes: { where: { resolvedAt: null } }; lessons: { include: { lesson: true } } };
}>;

function toTarget(k: Item): SpeakingTarget {
  return {
    knowledgeItemId: k.id,
    label: k.vocabulary?.hanzi ?? k.grammarPoint?.name ?? "",
    pinyin: k.vocabulary?.pinyin ?? null,
    meaning: k.vocabulary?.french ?? k.vocabulary?.english ?? k.grammarPoint?.explanation ?? null,
  };
}

/**
 * Compose les exercices d'oral : questions de la professeure (issues des PDF),
 * défis « utilise ces mots » sur le vocabulaire récent / faible / en erreur, et grammaire récente.
 */
export async function getSpeakingPrompts(limit = 6): Promise<SpeakingPrompt[]> {
  const userId = await getUserId();
  const items = await prisma.knowledgeItem.findMany({
    where: { userId, status: "ACTIVE", type: { in: ["VOCABULARY", "EXPRESSION", "GRAMMAR"] } },
    include: { vocabulary: true, grammarPoint: true, reviewState: true, mistakes: { where: { resolvedAt: null } }, lessons: { include: { lesson: true } } },
  });
  if (items.length === 0) return [];
  const lastLessonDate = (k: Item) => Math.max(0, ...k.lessons.map((l) => l.lesson.date.getTime()));
  // Priorité : erreurs actives, puis déjà vus mais faibles en usage/production, puis récents.
  const weight = (k: Item) =>
    k.mistakes.reduce((n, m) => n + m.occurrences, 0) * 3 +
    (k.reviewState && k.reviewState.reps > 0 ? (100 - (k.reviewState.usageScore + k.reviewState.productionScore) / 2) / 25 : 0) +
    lastLessonDate(k) / 8.64e7 / 30;
  const vocab = items.filter((k) => k.vocabulary).sort((a, b) => weight(b) - weight(a));
  const grammar = items.filter((k) => k.grammarPoint).sort((a, b) => lastLessonDate(b) - lastLessonDate(a));

  const prompts: SpeakingPrompt[] = [];

  // 1. Questions de discussion de la professeure (cours les plus récents).
  const questions = await prisma.exercise.findMany({
    where: { type: "SPEAKING", lesson: { userId, kind: "COURSE", processingStatus: "VALIDATED" } },
    include: { lesson: true },
    orderBy: [{ lesson: { date: "desc" } }, { sourcePage: "asc" }],
    take: 20,
  });
  const attempted = new Set(
    (await prisma.speakingAttempt.findMany({ where: { userId }, select: { prompt: true }, orderBy: { createdAt: "desc" }, take: 50 })).map((a) => a.prompt),
  );
  for (const q of questions.filter((q) => !attempted.has(q.prompt)).slice(0, 3)) {
    const lessonVocab = vocab.filter((k) => k.lessons.some((l) => l.lessonId === q.lessonId)).slice(0, 3);
    const meta = (q.metadata as { context?: string | null } | null) ?? {};
    prompts.push({
      key: `q:${q.id}`,
      kind: "TEACHER_QUESTION",
      questionHanzi: q.prompt,
      instructionFr: "Réponds à voix haute à la question du cours.",
      context: meta.context ?? null,
      targets: lessonVocab.map(toTarget),
      lessonTitle: q.lesson?.title ?? null,
      sourceType: q.sourceType,
    });
  }

  // 2. Défis de vocabulaire (groupes de 3 mots).
  for (let i = 0; i < Math.min(vocab.length, 9) && prompts.length < limit - 1; i += 3) {
    const group = vocab.slice(i, i + 3);
    if (group.length < 2) break;
    prompts.push({
      key: `w:${group.map((g) => g.id).join(",")}`,
      kind: "USE_WORDS",
      questionHanzi: null,
      instructionFr: "Dis une ou deux phrases qui utilisent ces mots.",
      context: null,
      targets: group.map(toTarget),
      lessonTitle: null,
      sourceType: "USER",
    });
  }

  // 3. Grammaire récente.
  for (const g of grammar.slice(0, 1)) {
    prompts.push({
      key: `g:${g.id}`,
      kind: "GRAMMAR",
      questionHanzi: null,
      instructionFr: `Fais une phrase avec la structure ${g.grammarPoint!.name}${g.grammarPoint!.explanation ? ` (${g.grammarPoint!.explanation})` : ""}.`,
      context: g.grammarPoint!.structure,
      targets: [toTarget(g)],
      lessonTitle: null,
      sourceType: "USER",
    });
  }
  return prompts.slice(0, limit);
}

export interface SpeakingInput {
  prompt: string;
  questionHanzi: string | null;
  instructionFr: string;
  targetIds: string[];
  transcription: string;
  inputMode: "VOICE" | "TEXT";
  durationSeconds: number | null;
  audioPath: string | null;
}

export type SpeakingResult =
  | { status: "evaluated"; attemptId: string; feedback: SpeakingFeedback }
  | { status: "saved_without_ai"; attemptId: string; reason: string };

const VALID_CATEGORIES = new Set<MistakeCategory>([
  "MEANING", "CHARACTER", "PINYIN", "TONE", "PRONUNCIATION", "GRAMMAR", "WORD_ORDER", "CLASSIFIER", "LISTENING", "USAGE", "OTHER",
]);

/** Enregistre une réponse orale, la fait évaluer par l'IA et met à jour erreurs et maîtrise. */
export async function submitSpeaking(input: SpeakingInput): Promise<SpeakingResult> {
  const userId = await getUserId();
  const transcription = input.transcription.trim().slice(0, 1000);
  if (!transcription) throw new Error("La transcription est vide.");
  const targets = await prisma.knowledgeItem.findMany({
    where: { id: { in: input.targetIds }, userId },
    include: { vocabulary: true, grammarPoint: true, reviewState: true },
  });
  const labels = targets.map((t) => t.vocabulary?.hanzi ?? t.grammarPoint?.name ?? "").filter(Boolean);

  const attempt = await prisma.speakingAttempt.create({
    data: {
      userId,
      knowledgeItemId: targets[0]?.id ?? null,
      prompt: input.prompt,
      targets: json(labels),
      audioPath: input.audioPath,
      transcription,
      inputMode: input.inputMode,
      durationSeconds: input.durationSeconds,
    },
  });

  const ai = await getAIStatus();
  if (!ai.available) {
    return { status: "saved_without_ai", attemptId: attempt.id, reason: ai.reason ?? "IA indisponible." };
  }
  let feedback: SpeakingFeedback;
  try {
    feedback = await evaluateSpeaking({
      question: input.questionHanzi ?? input.instructionFr,
      questionFr: input.questionHanzi ? undefined : input.instructionFr,
      targets: labels,
      transcription,
    });
  } catch (err) {
    return { status: "saved_without_ai", attemptId: attempt.id, reason: aiErrorMessage(err) };
  }

  await applyFeedback(userId, targets, feedback, { prompt: input.prompt, transcription, speakingAttemptId: attempt.id });
  return { status: "evaluated", attemptId: attempt.id, feedback };
}

type TargetRow = Prisma.KnowledgeItemGetPayload<{ include: { vocabulary: true; grammarPoint: true; reviewState: true } }>;

/**
 * Transforme le feedback oral en données : score d'usage des connaissances ciblées utilisées,
 * erreurs enregistrées pour les connaissances ciblées concernées par une correction.
 */
export async function applyFeedback(
  userId: string,
  targets: TargetRow[],
  feedback: Pick<SpeakingFeedback, "corrections" | "targetsUsed"> & { result?: SpeakingFeedback["result"] },
  ctx: { prompt: string; transcription: string; speakingAttemptId?: string; conversationId?: string },
) {
  const now = new Date();
  const labelOf = (t: TargetRow) => t.vocabulary?.hanzi ?? t.grammarPoint?.name ?? "";
  const used = new Set(feedback.targetsUsed.map(normalizeHanzi));

  await prisma.$transaction(async (tx) => {
    if (ctx.speakingAttemptId) {
      await tx.speakingAttempt.update({
        where: { id: ctx.speakingAttemptId },
        data: { feedback: json(feedback), result: feedback.result ?? null },
      });
    }
    for (const t of targets) {
      const label = normalizeHanzi(labelOf(t));
      const correction = feedback.corrections.find(
        (c) => (c.targetHanzi && normalizeHanzi(c.targetHanzi) === label) || (label && normalizeHanzi(c.original).includes(label)),
      );
      const wasUsed = used.has(label) || (!!label && normalizeHanzi(ctx.transcription).includes(label));
      if (!wasUsed && !correction) continue;

      let mistakeId: string | null = null;
      if (correction) {
        const category = VALID_CATEGORIES.has(correction.category as MistakeCategory) ? (correction.category as MistakeCategory) : "USAGE";
        const existing = await tx.mistake.findUnique({ where: { knowledgeItemId_category: { knowledgeItemId: t.id, category } } });
        const data = {
          lastSeenAt: now,
          userAnswer: correction.original,
          expectedAnswer: correction.corrected,
          explanation: correction.explanation,
          prompt: ctx.prompt,
          exerciseType: "SPEAKING" as const,
        };
        const m = existing
          ? await tx.mistake.update({
              where: { id: existing.id },
              data: { ...data, occurrences: { increment: 1 }, resolvedAt: null, reopenedCount: existing.resolvedAt ? { increment: 1 } : undefined },
            })
          : await tx.mistake.create({ data: { ...data, userId, knowledgeItemId: t.id, category } });
        mistakeId = m.id;
      }

      const result = correction ? "MOSTLY_CORRECT" : "CORRECT";
      await tx.reviewAttempt.create({
        data: {
          userId,
          knowledgeItemId: t.id,
          mistakeId,
          exerciseType: "SPEAKING",
          dimension: "USAGE",
          prompt: ctx.prompt,
          userAnswer: ctx.transcription,
          expectedAnswer: correction?.corrected ?? labelOf(t),
          result,
          evaluationMethod: "AI",
          feedback: correction?.explanation ?? "Utilisé à l'oral.",
        },
      });
      const s = t.reviewState;
      if (s) {
        const scores = updateScores(
          {
            recognitionScore: s.recognitionScore,
            productionScore: s.productionScore,
            listeningScore: s.listeningScore,
            pronunciationScore: s.pronunciationScore,
            usageScore: s.usageScore,
          },
          "USAGE",
          result,
        );
        await tx.reviewState.update({ where: { id: s.id }, data: { usageScore: scores.usageScore } });
      }
    }
  });
}

export async function recentSpeakingAttempts(limit = 10) {
  const userId = await getUserId();
  return prisma.speakingAttempt.findMany({ where: { userId, conversationId: null }, orderBy: { createdAt: "desc" }, take: limit });
}
