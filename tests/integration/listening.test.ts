/**
 * Exercices d'écoute : le texte chinois n'est jamais affiché avant la réponse,
 * les performances d'écoute sont enregistrées, l'absence d'audio ne pénalise pas.
 */
import { describe, expect, it } from "vitest";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { buildExercise, toPublic, type KnowledgeForExercise } from "@/lib/review/exercises";
import { getSessionView, submitAnswer } from "@/server/review";
import { getUserId } from "@/server/user";

async function makeItem(hanzi: string, pinyin: string, french: string) {
  const userId = await getUserId();
  return prisma.knowledgeItem.create({
    data: {
      userId,
      type: "VOCABULARY",
      sourceType: "USER",
      canonicalKey: `VOCABULARY:${hanzi}`,
      vocabulary: { create: { hanzi, pinyin, pinyinSource: "USER", french, frenchSource: "USER" } },
      reviewState: { create: { reps: 2, intervalDays: 3, lastReviewAt: new Date(Date.now() - 3 * 86_400_000), nextReviewAt: new Date() } },
    },
  });
}

function asExercise(id: string, hanzi: string, pinyin: string, french: string): KnowledgeForExercise {
  return {
    id,
    type: "VOCABULARY",
    hanzi,
    pinyin,
    french,
    english: null,
    grammar: null,
    examples: [],
    reps: 2,
    scores: { recognition: 60, production: 60, listening: 0 },
    mistakeCategories: [],
  };
}

async function sessionWith(plan: unknown[]) {
  const userId = await getUserId();
  return prisma.learningSession.create({ data: { userId, kind: "KNOWLEDGE", plan: plan as Prisma.InputJsonValue } });
}

describe("écoute", () => {
  it("masque le texte : seul l'audio est fourni, la réponse reste sur le serveur", () => {
    const spec = buildExercise(asExercise("x", "旅行", "lǚ xíng", "voyager"), "LISTENING", { reason: "due" })!;
    const pub = toPublic(spec);
    expect(pub.prompt.display).toBeNull();
    expect(pub.prompt.audioText).toBe("旅行");
    expect(pub.dimension).toBe("LISTENING");
    expect((pub as Record<string, unknown>).answer).toBeUndefined();
  });

  it("audio → chinois : évalue la réponse et met à jour le score d'écoute", async () => {
    const item = await makeItem("旅行", "lǚ xíng", "voyager");
    const spec = buildExercise(asExercise(item.id, "旅行", "lǚ xíng", "voyager"), "LISTENING", { reason: "due" })!;
    const session = await sessionWith([spec]);
    const out = await submitAnswer(session.id, { index: 0, answer: "lv3 xing2" });
    expect(out).toMatchObject({ status: "final", result: "CORRECT" });
    const state = await prisma.reviewState.findUniqueOrThrow({ where: { knowledgeItemId: item.id } });
    expect(state.listeningScore).toBeGreaterThan(0);
    const attempt = await prisma.reviewAttempt.findFirstOrThrow({ where: { sessionId: session.id } });
    expect(attempt).toMatchObject({ exerciseType: "LISTENING", dimension: "LISTENING", result: "CORRECT" });
  });

  it("audio → sens : une mauvaise compréhension devient une erreur d'écoute", async () => {
    const item = await makeItem("现金", "xiàn jīn", "espèces, argent liquide");
    // La compréhension orale porte sur une phrase.
    const sentence = buildExercise(
      { ...asExercise(item.id, "我用现金付款。", "wǒ yòng xiàn jīn fù kuǎn", "Je paie en espèces."), type: "SENTENCE" },
      "LISTENING_MEANING",
      { reason: "due" },
    )!;
    expect(sentence.type).toBe("LISTENING_MEANING");
    const session = await sessionWith([sentence]);
    const judged = await submitAnswer(session.id, { index: 0, answer: "je paie par carte" });
    expect(judged.status).toBe("needs_judgment");
    const out = await submitAnswer(session.id, { index: 0, answer: "je paie par carte", selfResult: "INCORRECT" });
    expect(out).toMatchObject({ status: "final", result: "INCORRECT", category: "LISTENING" });
    const mistake = await prisma.mistake.findFirstOrThrow({ where: { knowledgeItemId: item.id } });
    expect(mistake.category).toBe("LISTENING");
  });

  it("audio indisponible : l'exercice est passé sans modifier la planification", async () => {
    const item = await makeItem("密码", "mì mǎ", "mot de passe");
    const before = await prisma.reviewState.findUniqueOrThrow({ where: { knowledgeItemId: item.id } });
    const spec = buildExercise(asExercise(item.id, "密码", "mì mǎ", "mot de passe"), "LISTENING", { reason: "due" })!;
    const session = await sessionWith([spec]);
    const out = await submitAnswer(session.id, { index: 0, answer: "", skipUnavailable: true });
    expect(out).toMatchObject({ status: "final", result: "SKIPPED" });
    const after = await prisma.reviewState.findUniqueOrThrow({ where: { knowledgeItemId: item.id } });
    expect(after.nextReviewAt?.getTime()).toBe(before.nextReviewAt?.getTime());
    expect(after.intervalDays).toBe(before.intervalDays);
    const view = await getSessionView(session.id);
    expect(view.stats.reviews).toBe(0);
  });
});
