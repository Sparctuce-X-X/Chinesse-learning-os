import { describe, expect, it } from "vitest";
import {
  blankMarkers,
  buildExercise,
  chooseType,
  generateExercise,
  grammarMarkers,
  toPublic,
  type KnowledgeForExercise,
} from "@/lib/review/exercises";
import { evaluateLocally } from "@/lib/review/evaluate";

const vocab: KnowledgeForExercise = {
  id: "k1",
  type: "VOCABULARY",
  hanzi: "付款",
  pinyin: "fù kuǎn",
  french: "payer",
  english: "to pay",
  grammar: null,
  examples: [{ hanzi: "您怎么付款？", pinyin: null, french: "Comment payez-vous ?", english: null }],
  reps: 0,
  scores: { recognition: 0, production: 0, listening: 0 },
  mistakeCategories: [],
};

describe("choix des exercices", () => {
  it("nouveau mot → reconnaissance, puis production", () => {
    expect(chooseType(vocab, { reason: "new" })).toBe("RECOGNITION");
    expect(chooseType({ ...vocab, reps: 1 }, { reason: "due" })).toBe("PRODUCTION");
  });

  it("une erreur de ton oriente vers un exercice de pinyin", () => {
    expect(chooseType({ ...vocab, reps: 4, mistakeCategories: ["TONE"] }, { reason: "mistake" })).toBe("PINYIN");
  });

  it("n'envoie jamais la réponse au client", () => {
    const spec = generateExercise({ ...vocab, reps: 1 }, { reason: "due" })!;
    const pub = toPublic(spec) as Record<string, unknown>;
    expect(pub.answer).toBeUndefined();
    expect(JSON.stringify(pub)).not.toContain("付款");
    expect(spec.prompt.display).toContain("payer");
  });

  it("phrase à trou à partir d'un exemple", () => {
    const spec = buildExercise({ ...vocab, reps: 3 }, "FILL_BLANK", { reason: "due" })!;
    expect(spec.prompt.display).toBe("您怎么＿＿？");
  });

  it("reconstruction : les tuiles recomposent la phrase", () => {
    const s: KnowledgeForExercise = { ...vocab, id: "s1", type: "SENTENCE", hanzi: "我喜欢去中国旅行。", french: "J'aime voyager en Chine." };
    const spec = buildExercise(s, "SENTENCE_RECONSTRUCTION", { reason: "new" })!;
    expect([...spec.prompt.tiles!.join("")].sort().join("")).toBe([..."我喜欢去中国旅行"].sort().join(""));
    expect(spec.prompt.tiles!.join("")).not.toBe("我喜欢去中国旅行");
  });

  it("grammaire : repère les marqueurs et crée le trou", () => {
    expect(grammarMarkers("只要…就…")).toEqual(["只要", "就"]);
    expect(grammarMarkers("只要...就... (As long as...)")).toEqual(["只要", "就"]);
    expect(grammarMarkers("Condition", "只要 + Condition + 就 + Result")).toEqual(["只要", "就"]);
    expect(blankMarkers("只要下载软件，就可以使用了。", ["只要", "就"])).toBe("＿＿下载软件，＿＿可以使用了。");
    const g: KnowledgeForExercise = {
      ...vocab,
      id: "g1",
      type: "GRAMMAR",
      hanzi: null,
      grammar: { name: "只要…就…", structure: "只要 + condition + 就 + résultat", explanation: "condition suffisante" },
      examples: [{ hanzi: "只要下载软件，就可以使用了。", pinyin: null, french: null, english: "As long as you download the app, you can use it." }],
    };
    const spec = generateExercise(g, { reason: "due" })!;
    expect(spec.type).toBe("GRAMMAR");
    expect(spec.prompt.display).toBe("＿＿下载软件，＿＿可以使用了。");
    expect(evaluateLocally(spec, "只要 就")).toMatchObject({ result: "CORRECT" });
    expect(evaluateLocally(spec, "只要 才")).toMatchObject({ result: "INCORRECT", category: "CHARACTER" });
  });
});

describe("évaluation locale", () => {
  const prod = buildExercise({ ...vocab, reps: 1 }, "PRODUCTION", { reason: "due" })!;
  const pinyin = buildExercise({ ...vocab, reps: 2 }, "PINYIN", { reason: "due" })!;
  const reco = buildExercise(vocab, "RECOGNITION", { reason: "new" })!;

  it("production : caractères exacts", () => {
    expect(evaluateLocally(prod, "付款")).toMatchObject({ status: "final", result: "CORRECT" });
    expect(evaluateLocally(prod, "付钱")).toMatchObject({ result: "INCORRECT", category: "CHARACTER" });
    expect(evaluateLocally(prod, "银行")).toMatchObject({ result: "INCORRECT", category: "MEANING" });
  });

  it("production : réponse en pinyin", () => {
    expect(evaluateLocally(prod, "fu4 kuan3")).toMatchObject({ result: "CORRECT" });
    expect(evaluateLocally(prod, "fukuan")).toMatchObject({ result: "MOSTLY_CORRECT", category: "TONE" });
    expect(evaluateLocally(prod, "fu2kuan3")).toMatchObject({ result: "MOSTLY_CORRECT", category: "TONE" });
  });

  it("exercice de pinyin : tons obligatoires", () => {
    expect(evaluateLocally(pinyin, "fùkuǎn")).toMatchObject({ result: "CORRECT" });
    expect(evaluateLocally(pinyin, "fu kuan")).toMatchObject({ result: "MOSTLY_CORRECT", category: "TONE" });
    expect(evaluateLocally(pinyin, "fu2 kuan3")).toMatchObject({ result: "INCORRECT", category: "TONE" });
    expect(evaluateLocally(pinyin, "fa kuan")).toMatchObject({ result: "INCORRECT", category: "PINYIN" });
  });

  it("reconnaissance : glose tolérante sinon jugement", () => {
    expect(evaluateLocally(reco, "Payer")).toMatchObject({ result: "CORRECT" });
    expect(evaluateLocally(reco, "pay")).toMatchObject({ result: "CORRECT" });
    expect(evaluateLocally(reco, "régler une facture")).toEqual({ status: "needs_judgment" });
  });

  it("réponse vide = échec sans catégorie", () => {
    expect(evaluateLocally(prod, "  ")).toMatchObject({ result: "INCORRECT", category: null });
  });
});
