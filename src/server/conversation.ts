import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { getAIStatus } from "@/lib/ai";
import {
  createConversation,
  replyConversation,
  summarizeConversation,
  type ConversationHistoryTurn,
  type ConversationTargets,
} from "@/lib/ai/tasks";
import { aiErrorMessage } from "@/lib/ai/types";
import { ConversationSetupSchema, ConversationSummarySchema, type ConversationSetup } from "@/lib/ai/schemas";
import { applyFeedback } from "./speaking";
import { getUserId } from "./user";

const json = (v: unknown) => v as Prisma.InputJsonValue;

export class ConversationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConversationError";
  }
}

export const SCENARIOS: { value: string; label: string; emoji: string }[] = [
  { value: "restaurant", label: "Au restaurant", emoji: "🍜" },
  { value: "hôtel", label: "À l'hôtel", emoji: "🏨" },
  { value: "voyage", label: "En voyage", emoji: "🚄" },
  { value: "travail", label: "Au travail", emoji: "💼" },
  { value: "rencontre", label: "Première rencontre", emoji: "🤝" },
  { value: "achats", label: "Faire des achats", emoji: "🛍️" },
  { value: "taxi", label: "En taxi", emoji: "🚕" },
  { value: "quotidien", label: "Le quotidien", emoji: "☕" },
  { value: "ami", label: "Discussion avec un ami", emoji: "💬" },
];

interface TargetInfo {
  targets: ConversationTargets;
  ids: string[];
}

/** Connaissances ciblées : vocabulaire récent et faible, grammaire récente, erreurs récurrentes. */
export async function selectConversationTargets(userId: string): Promise<TargetInfo> {
  const items = await prisma.knowledgeItem.findMany({
    where: { userId, status: "ACTIVE", type: { in: ["VOCABULARY", "EXPRESSION", "GRAMMAR"] } },
    include: {
      vocabulary: true,
      grammarPoint: true,
      reviewState: true,
      mistakes: { where: { resolvedAt: null } },
      lessons: { include: { lesson: { select: { date: true } } } },
    },
  });
  const recency = (k: (typeof items)[number]) => Math.max(0, ...k.lessons.map((l) => l.lesson.date.getTime()));
  const vocab = items
    .filter((k) => k.vocabulary)
    .sort((a, b) => recency(b) - recency(a) || (a.reviewState?.productionScore ?? 0) - (b.reviewState?.productionScore ?? 0));
  const weak = items.filter((k) => k.vocabulary && k.reviewState && k.reviewState.reps > 0 && k.reviewState.productionScore < 60);
  const chosenVocab = [...new Map([...vocab.slice(0, 4), ...weak.slice(0, 2)].map((k) => [k.id, k])).values()].slice(0, 6);
  const grammar = items.filter((k) => k.grammarPoint).sort((a, b) => recency(b) - recency(a)).slice(0, 2);
  const mistakes = items.filter((k) => k.mistakes.length > 0).sort((a, b) => b.mistakes.length - a.mistakes.length).slice(0, 3);
  return {
    targets: {
      vocabulary: chosenVocab.map((k) => k.vocabulary!.hanzi),
      grammar: grammar.map((k) => k.grammarPoint!.name),
      mistakes: mistakes.map((k) => k.vocabulary?.hanzi ?? k.grammarPoint?.name ?? "").filter(Boolean),
    },
    ids: [...chosenVocab, ...grammar, ...mistakes].map((k) => k.id),
  };
}

export async function startConversation(scenario: string): Promise<string> {
  const userId = await getUserId();
  const ai = await getAIStatus();
  if (!ai.available) throw new ConversationError(`La conversation nécessite l'IA : ${(ai.reason ?? "non configurée").replace(/\.$/, "")}.`);
  const scenarioLabel = SCENARIOS.find((s) => s.value === scenario)?.label ?? scenario.slice(0, 60);
  const { targets, ids } = await selectConversationTargets(userId);
  let setup: ConversationSetup;
  try {
    setup = await createConversation(scenarioLabel, targets);
  } catch (err) {
    throw new ConversationError(aiErrorMessage(err));
  }
  const conv = await prisma.conversation.create({
    data: {
      userId,
      scenario: scenarioLabel,
      title: setup.title,
      setup: json(setup),
      targets: json({ ...targets, ids }),
      turns: {
        create: {
          role: "ASSISTANT",
          hanzi: setup.openingHanzi,
          pinyin: setup.openingPinyin,
          french: setup.openingFrench,
        },
      },
    },
  });
  return conv.id;
}

export async function getConversation(id: string) {
  const conv = await prisma.conversation.findUnique({ where: { id }, include: { turns: { orderBy: { createdAt: "asc" } } } });
  if (!conv) return null;
  const setup = ConversationSetupSchema.safeParse(conv.setup);
  const summary = conv.summary ? ConversationSummarySchema.safeParse(conv.summary) : null;
  const targets = conv.targets as (ConversationTargets & { ids?: string[] }) | null;
  return {
    ...conv,
    setupData: setup.success ? setup.data : null,
    summaryData: summary?.success ? summary.data : null,
    targetsData: targets ?? { vocabulary: [], grammar: [], mistakes: [], ids: [] },
  };
}

export async function sendConversationMessage(id: string, message: string, inputMode: "TEXT" | "VOICE", durationSeconds?: number) {
  const conv = await getConversation(id);
  if (!conv) throw new ConversationError("Conversation introuvable.");
  if (conv.completedAt) throw new ConversationError("Cette conversation est terminée.");
  const text = message.trim().slice(0, 500);
  if (!text) throw new ConversationError("Message vide.");

  const userTurn = await prisma.conversationTurn.create({
    data: { conversationId: id, role: "USER", hanzi: text, inputMode },
  });
  const history: ConversationHistoryTurn[] = conv.turns.map((t) => ({ role: t.role, hanzi: t.hanzi }));
  let reply;
  try {
    reply = await replyConversation({
      scenario: conv.scenario,
      situation: conv.setupData?.situationFr ?? conv.scenario,
      targets: conv.targetsData,
      history,
      userMessage: text,
    });
  } catch (err) {
    // Le message de l'utilisateur est conservé ; il pourra réessayer.
    throw new ConversationError(`${aiErrorMessage(err)} Ton message est enregistré.`);
  }

  await prisma.conversationTurn.update({ where: { id: userTurn.id }, data: { feedback: json(reply.feedback) } });
  await prisma.conversationTurn.create({
    data: { conversationId: id, role: "ASSISTANT", hanzi: reply.replyHanzi, pinyin: reply.replyPinyin, french: reply.replyFrench },
  });

  const userId = conv.userId;
  if (inputMode === "VOICE") {
    await prisma.speakingAttempt.create({
      data: {
        userId,
        conversationId: id,
        prompt: history[history.length - 1]?.hanzi ?? conv.scenario,
        targets: json(conv.targetsData.vocabulary),
        transcription: text,
        inputMode: "VOICE",
        durationSeconds: durationSeconds ?? null,
        feedback: json(reply.feedback),
      },
    });
  }
  const targets = await prisma.knowledgeItem.findMany({
    where: { id: { in: conv.targetsData.ids ?? [] } },
    include: { vocabulary: true, grammarPoint: true, reviewState: true },
  });
  await applyFeedback(userId, targets, reply.feedback, { prompt: `Conversation : ${conv.scenario}`, transcription: text, conversationId: id });
  return { shouldEnd: reply.shouldEnd };
}

export async function endConversation(id: string) {
  const conv = await getConversation(id);
  if (!conv) throw new ConversationError("Conversation introuvable.");
  if (conv.completedAt && conv.summaryData) return conv.summaryData;
  const history = conv.turns.map((t) => ({ role: t.role, hanzi: t.hanzi }));
  let summary = null;
  if (conv.turns.some((t) => t.role === "USER")) {
    try {
      summary = await summarizeConversation({ scenario: conv.scenario, targets: conv.targetsData, history });
    } catch (err) {
      throw new ConversationError(aiErrorMessage(err));
    }
  }
  await prisma.conversation.update({ where: { id }, data: { completedAt: new Date(), summary: summary ? json(summary) : undefined } });
  return summary;
}

export async function listConversations(limit = 10) {
  const userId = await getUserId();
  return prisma.conversation.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: limit,
    include: { _count: { select: { turns: true } } },
  });
}
