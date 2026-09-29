/**
 * Boucle fondamentale de bout en bout, au niveau des services :
 * PDF réel → extraction → analyse → brouillon → validation → connaissances
 * → session → réponses → erreurs → nouvelles révisions.
 */
import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db/prisma";
import { getMockProvider } from "@/lib/ai";
import { LessonExtractionSchema } from "@/lib/ai/schemas";
import { approveAll } from "@/lib/lessons/draft";
import { getDraft, importPdf, runAnalysis, saveDraft, validateLesson } from "@/server/lessons";
import { completeSession, createSession, getSessionView, getTodaySummary, newIntroducedToday, submitAnswer, loadPlanItems } from "@/server/review";
import { listKnowledge } from "@/server/knowledge";
import { listMistakes } from "@/server/mistakes";
import { getUserId } from "@/server/user";

const PDF_PATH = "source-materials/pdf/L1 Dmn- Mobile Payment.pdf";
const fixture = LessonExtractionSchema.parse(
  JSON.parse(readFileSync("tests/fixtures/ai-analysis-L1-mobile-payment.json", "utf8")),
);

let lessonId: string;

beforeAll(async () => {
  // Réponse d'analyse = sortie réelle de Claude enregistrée sur ce PDF.
  getMockProvider().register("analyze-lesson", () => fixture);
});

describe("import et analyse", () => {
  it("rejette un fichier qui n'est pas un PDF sans perdre de données", async () => {
    const res = await importPdf("faux.pdf", new TextEncoder().encode("bonjour"), { analyze: false });
    const lesson = await prisma.lesson.findUniqueOrThrow({ where: { id: res.lessonId }, include: { documents: true } });
    expect(lesson.processingStatus).toBe("FAILED");
    expect(lesson.analysisError).toMatch(/PDF/);
    expect(lesson.documents[0].processingStatus).toBe("FAILED");
  });

  it("extrait le texte page par page du vrai PDF", async () => {
    const data = new Uint8Array(readFileSync(PDF_PATH));
    const res = await importPdf("L1 Dmn- Mobile Payment.pdf", data, { analyze: false });
    lessonId = res.lessonId;
    const doc = await prisma.sourceDocument.findFirstOrThrow({ where: { lessonId }, include: { pages: true } });
    expect(doc.pageCount).toBe(22);
    expect(doc.pages).toHaveLength(22);
    expect(doc.pages.find((p) => p.pageNumber === 10)?.text).toContain("付款");
    expect(doc.imagePages).toEqual(expect.arrayContaining([5, 6, 7, 8, 9]));
    // L'original n'est jamais modifié : une copie interne est utilisée.
    expect(doc.storagePath).not.toContain("source-materials");
  });

  it("analyse et prépare un brouillon avec provenance et confiance", async () => {
    await runAnalysis(lessonId);
    const lesson = await prisma.lesson.findUniqueOrThrow({ where: { id: lessonId } });
    expect(lesson.processingStatus).toBe("READY_FOR_REVIEW");
    expect(lesson.extractionMethod).toBe("AI");
    const draft = (await getDraft(lessonId))!;
    expect(draft.vocabulary.length).toBe(47);
    const fukuan = draft.vocabulary.find((v) => v.hanzi === "付款")!;
    expect(fukuan.englishSource).toBe("TEACHER");
    expect(fukuan.frenchSource).toBe("AI");
    expect(fukuan.sourcePage).toBe(10);
    expect(draft.sentences.some((s) => s.origin === "STUDENT_PRACTICE" && s.confidence === "LOW")).toBe(true);
  });

  it("repli heuristique si l'IA échoue, sans perdre le PDF", async () => {
    const data = new Uint8Array(readFileSync(PDF_PATH));
    const res = await importPdf("copie.pdf", data, { analyze: false });
    expect(res.duplicateOf?.lessonId).toBe(lessonId);
    process.env.AI_MOCK_FAIL = "analyze-lesson";
    try {
      await runAnalysis(res.lessonId);
    } finally {
      delete process.env.AI_MOCK_FAIL;
    }
    const lesson = await prisma.lesson.findUniqueOrThrow({ where: { id: res.lessonId } });
    expect(lesson.processingStatus).toBe("READY_FOR_REVIEW");
    expect(lesson.extractionMethod).toBe("HEURISTIC");
    const draft = (await getDraft(res.lessonId))!;
    expect(draft.warnings.join(" ")).toMatch(/Extraction simple/);
    expect(draft.vocabulary.find((v) => v.hanzi === "付款")?.pinyin).toBe("fù kuǎn");
    await prisma.lesson.delete({ where: { id: res.lessonId } });
  });
});

describe("validation", () => {
  it("applique les corrections utilisateur et crée les connaissances approuvées", async () => {
    const draft = (await getDraft(lessonId))!;
    // Correction manuelle d'un élément, rejet d'un autre.
    const idx = draft.vocabulary.findIndex((v) => v.hanzi === "密码");
    draft.vocabulary[idx] = { ...draft.vocabulary[idx], french: "mot de passe", frenchSource: "USER", edited: true };
    const rejected = draft.vocabulary.find((v) => v.hanzi === "嗯")!;
    rejected.decision = "rejected";
    await saveDraft(lessonId, approveAll(draft));

    const summary = await validateLesson(lessonId, { title: "Le paiement mobile", date: "2026-09-07" });
    expect(summary.created).toBeGreaterThan(70);
    expect(summary.merged).toBe(0);

    const lesson = await prisma.lesson.findUniqueOrThrow({ where: { id: lessonId } });
    expect(lesson.processingStatus).toBe("VALIDATED");

    const vocab = await listKnowledge("vocabulary");
    expect(vocab.find((v) => v.primary === "嗯")).toBeUndefined();
    const mima = await prisma.vocabulary.findFirstOrThrow({ where: { hanzi: "密码" } });
    expect(mima.french).toBe("mot de passe");
    expect(mima.frenchSource).toBe("USER");
    const link = await prisma.lessonKnowledge.findFirstOrThrow({ where: { knowledgeItemId: mima.knowledgeItemId } });
    expect(link.sourcePage).toBe(10);

    // Phrase d'élève importée comme provenance USER, jamais TEACHER.
    const practice = await prisma.sentence.findFirstOrThrow({ where: { hanzi: { contains: "只要不带伞" } }, include: { knowledgeItem: true } });
    expect(practice.knowledgeItem.sourceType).toBe("USER");
  });

  it("recherche par hanzi, pinyin et français", async () => {
    expect((await listKnowledge("all", "付款")).length).toBeGreaterThan(0);
    expect((await listKnowledge("all", "fukuan")).some((k) => k.primary === "付款")).toBe(true);
    expect((await listKnowledge("all", "mot de passe")).some((k) => k.primary === "密码")).toBe(true);
    expect((await listKnowledge("grammar")).length).toBe(2);
  });

  it("déduplique : un second cours avec les mêmes mots les rattache au lieu de les recréer", async () => {
    const before = await prisma.knowledgeItem.count();
    const data = new Uint8Array(readFileSync(PDF_PATH));
    const res = await importPdf("revision.pdf", data, { analyze: false });
    await runAnalysis(res.lessonId);
    const draft = (await getDraft(res.lessonId))!;
    const fukuan = draft.vocabulary.find((v) => v.hanzi === "付款")!;
    expect(fukuan.duplicate?.action).toBe("merge");
    await saveDraft(res.lessonId, approveAll(draft));
    const summary = await validateLesson(res.lessonId, { title: "Révision", date: "2026-09-14" });
    expect(summary.merged).toBeGreaterThan(40);
    // Seul 嗯 (rejeté la première fois) peut être nouveau.
    expect((await prisma.knowledgeItem.count()) - before).toBeLessThanOrEqual(1);
    const item = await prisma.vocabulary.findFirstOrThrow({ where: { hanzi: "付款" }, include: { knowledgeItem: { include: { lessons: true } } } });
    expect(item.knowledgeItem.lessons).toHaveLength(2);
  });
});

describe("abandon d'un import", () => {
  it("supprime le cours non validé et sa copie interne, jamais l'original", async () => {
    const { existsSync } = await import("node:fs");
    const { discardImport } = await import("@/server/lessons");
    const { absoluteStoragePath } = await import("@/server/storage");
    const res = await importPdf("a-jeter.pdf", new Uint8Array(readFileSync(PDF_PATH)), { analyze: false });
    const doc = await prisma.sourceDocument.findFirstOrThrow({ where: { lessonId: res.lessonId } });
    expect(existsSync(absoluteStoragePath(doc.storagePath))).toBe(true);
    await discardImport(res.lessonId);
    expect(await prisma.lesson.findUnique({ where: { id: res.lessonId } })).toBeNull();
    expect(existsSync(absoluteStoragePath(doc.storagePath))).toBe(false);
    expect(existsSync(PDF_PATH)).toBe(true);
  });
});

describe("session, erreurs et révisions", () => {
  it("compose une session, enregistre les réponses, crée les erreurs et replanifie", async () => {
    const { id, count } = await createSession({ kind: "DAILY", listening: false });
    expect(count).toBeGreaterThan(0);
    let view = await getSessionView(id);
    expect(view.exercise).not.toBeNull();
    expect(JSON.stringify(view.exercise)).not.toContain('"answer"');

    // 1re réponse : volontairement fausse.
    const first = view.exercise!;
    const wrong = await submitAnswer(id, { index: 0, answer: "错错错", responseTimeMs: 4000 });
    let finalOutcome = wrong;
    if (wrong.status === "needs_judgment") {
      finalOutcome = await submitAnswer(id, { index: 0, answer: "voiture", selfResult: "INCORRECT" });
    }
    expect(finalOutcome.status).toBe("final");
    if (finalOutcome.status !== "final") return;
    expect(finalOutcome.result).toBe("INCORRECT");
    expect(finalOutcome.relearnQueued).toBe(true);
    expect(finalOutcome.reveal.expected.length).toBeGreaterThan(0);

    const mistakes = await listMistakes("todo");
    expect(mistakes.some((m) => m.knowledgeItemId === first.knowledgeItemId)).toBe(true);

    // Réponses correctes pour le reste (via la réponse attendue interne).
    view = await getSessionView(id);
    while (view.exercise) {
      const session = await prisma.learningSession.findUniqueOrThrow({ where: { id } });
      const plan = session.plan as { answer: { expected: string; evaluation: string } }[];
      const spec = plan[view.index];
      const outcome = await submitAnswer(id, { index: view.index, answer: spec.answer.expected, responseTimeMs: 3000 });
      if (outcome.status === "needs_judgment") {
        await submitAnswer(id, { index: view.index, answer: spec.answer.expected, selfResult: "CORRECT" });
      }
      view = await getSessionView(id);
    }
    expect(view.completed).toBe(true);
    expect(view.total).toBe(count + 1); // + réapprentissage

    const summary = await completeSession(id);
    expect(summary.completed).toBe(true);
    expect(summary.reviews).toBe(count + 1);
    expect(summary.mistakes).toBe(1);

    const attempts = await prisma.reviewAttempt.count({ where: { sessionId: id } });
    expect(attempts).toBe(count + 1);

    // Les éléments réussis sont replanifiés dans le futur.
    const states = await prisma.reviewState.findMany({ where: { reps: { gt: 0 } } });
    expect(states.length).toBeGreaterThan(0);
    for (const s of states) expect(s.nextReviewAt!.getTime()).toBeGreaterThan(Date.now());

    // L'élément raté a une erreur active qui augmente sa priorité.
    const userId = await getUserId();
    const items = await loadPlanItems(userId);
    const failed = items.find((i) => i.id === first.knowledgeItemId)!;
    expect(failed.mistakeOccurrences).toBeGreaterThanOrEqual(1);
  });

  it("rythme quotidien : plafond de nouveautés par jour, journée validée, révisions seulement", async () => {
    const userId = await getUserId();
    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    const introduced = await newIntroducedToday(userId);
    expect(introduced).toBeGreaterThan(0);

    const day = await getTodaySummary();
    expect(day.dayDone).toBe(true);
    expect(day.today.newLearned).toBe(introduced);
    expect(day.today.reviews).toBeGreaterThan(0);
    expect(day.newRemaining).toBe(Math.max(0, user.newItemsPerDay - introduced));
    expect(day.plannedNew).toBeLessThanOrEqual(day.newRemaining);
    expect(day.tomorrow.reviews + day.tomorrow.newItems).toBeGreaterThan(0);

    // Crée une session quotidienne et vérifie qu'elle ne contient aucune nouveauté (ou qu'il n'y a rien à faire).
    const expectNoNewSession = async (reviewsOnly: boolean) => {
      try {
        const { id } = await createSession({ kind: "DAILY", listening: false, reviewsOnly });
        const session = await prisma.learningSession.findUniqueOrThrow({ where: { id } });
        expect((session.plan as { reason: string }[]).some((e) => e.reason === "new")).toBe(false);
        await prisma.learningSession.delete({ where: { id } });
      } catch (err) {
        expect((err as Error).message).toMatch(reviewsOnly ? /Plus aucune révision due/ : /Rien à réviser/);
      }
    };

    await expectNoNewSession(true);

    // Plafond atteint : les sessions suivantes ne proposent plus que des révisions.
    await prisma.user.update({ where: { id: userId }, data: { newItemsPerDay: introduced } });
    try {
      const capped = await getTodaySummary();
      expect(capped.newRemaining).toBe(0);
      expect(capped.plannedNew).toBe(0);
      await expectNoNewSession(false);
    } finally {
      await prisma.user.update({ where: { id: userId }, data: { newItemsPerDay: user.newItemsPerDay } });
    }
  });

  it("arrêt conseillé : réponses qui se dégradent, puis arrêt anticipé sans perte", async () => {
    const userId = await getUserId();
    const items = (await loadPlanItems(userId)).slice(0, 14);
    const { id } = await createSession({ kind: "KNOWLEDGE", knowledgeItemIds: items.map((i) => i.id), listening: false });
    try {
      const session = await prisma.learningSession.findUniqueOrThrow({ where: { id } });
      // Toutes des révisions (les erreurs sur une notion nouvelle ne comptent pas comme de la fatigue).
      const plan = (session.plan as { knowledgeItemId: string; type: string; dimension: string; reason: string }[]).map((e) => ({ ...e, reason: "due" }));
      expect(plan.length).toBeGreaterThanOrEqual(11);
      await prisma.learningSession.update({ where: { id }, data: { plan, currentIndex: 7 } });
      // Réponses enregistrées directement : 2 réussies puis 5 ratées.
      const attempt = (e: (typeof plan)[number], i: number) => ({
        userId,
        sessionId: id,
        knowledgeItemId: e.knowledgeItemId,
        exerciseType: e.type as "RECOGNITION",
        dimension: e.dimension as "RECOGNITION",
        prompt: "test",
        userAnswer: "x",
        expectedAnswer: "y",
        result: i < 2 ? ("CORRECT" as const) : ("INCORRECT" as const),
        evaluationMethod: "SELF" as const,
        responseTimeMs: 3000,
      });
      await prisma.reviewAttempt.createMany({ data: plan.slice(0, 7).map(attempt) });
      expect((await getSessionView(id)).suggestStop).toBeNull(); // 7 réponses : trop peu pour juger

      await prisma.reviewAttempt.create({ data: attempt(plan[7], 7) });
      await prisma.learningSession.update({ where: { id }, data: { currentIndex: 8 } });
      expect((await getSessionView(id)).suggestStop).toBe("fatigue");

      const summary = await completeSession(id);
      expect(summary.completed).toBe(true);
      expect(summary.remaining).toBe(plan.length - 8);
    } finally {
      await prisma.reviewAttempt.deleteMany({ where: { sessionId: id } });
      await prisma.learningSession.delete({ where: { id } });
    }
  });

  it("session erreurs : ne contient que les éléments en erreur", async () => {
    const { id } = await createSession({ kind: "MISTAKES", listening: false });
    const session = await prisma.learningSession.findUniqueOrThrow({ where: { id } });
    const plan = session.plan as { knowledgeItemId: string }[];
    const mistakeItems = new Set((await listMistakes("todo")).map((m) => m.knowledgeItemId));
    expect(plan.every((p) => mistakeItems.has(p.knowledgeItemId))).toBe(true);
  });

  it("une erreur répétée devient récurrente, puis se résout après des réussites", async () => {
    const mistake = (await listMistakes("todo"))[0];
    const { id } = await createSession({ kind: "KNOWLEDGE", knowledgeItemIds: [mistake.knowledgeItemId], listening: false });
    const view = await getSessionView(id);
    const outcome = await submitAnswer(id, { index: 0, answer: "", dontKnow: true });
    expect(outcome.status).toBe("final");
    // « Je ne sais pas » est un échec de rappel, pas une réponse fausse : pas de nouvelle occurrence.
    const same = await prisma.mistake.findUniqueOrThrow({ where: { id: mistake.id } });
    expect(same.occurrences).toBe(mistake.occurrences);
    expect(view.total).toBe(1);
  });
});
