/**
 * L'importeur doit accepter des formats variés (futurs PDF de la professeure).
 * PDF réel + PDF synthétiques (voir tests/fixtures/synthetic/README.md).
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/db/prisma";
import { extractPdf, PdfExtractionError } from "@/lib/pdf/extract";
import { heuristicExtract } from "@/lib/pdf/heuristic";
import { normalizeExtractedText } from "@/lib/chinese/normalize";
import { getDraft, importPdf, runAnalysis } from "@/server/lessons";

const SYN = "tests/fixtures/synthetic";
const read = (p: string) => new Uint8Array(readFileSync(p));

async function heuristic(path: string, filename: string) {
  const ex = await extractPdf(read(path));
  return { ex, h: heuristicExtract({ filename, pages: ex.pages, pdfCreatedAt: ex.pdfCreatedAt }) };
}

describe("normalisation des caractères", () => {
  it("remplace les radicaux Unicode par les caractères usuels sans toucher la ponctuation", () => {
    expect(normalizeExtractedText("旅⾏ 出租⻋")).toBe("旅行 出租车");
    expect(normalizeExtractedText("你去过中国吗？好，走。")).toBe("你去过中国吗？好，走。");
  });
});

describe("formats de PDF", () => {
  it("PDF réel (diaporama HSK) : tableaux de vocabulaire, notes, grammaire, pages images", async () => {
    const { ex, h } = await heuristic("source-materials/pdf/L1 Dmn- Mobile Payment.pdf", "L1 Dmn- Mobile Payment.pdf");
    expect(ex.pageCount).toBe(22);
    expect(ex.imagePages).toEqual([5, 6, 7, 8, 9, 17, 20]);
    const byHanzi = Object.fromEntries(h.vocabulary.map((v) => [v.hanzi, v]));
    expect(byHanzi["银行卡"]).toMatchObject({ pinyin: "yín háng kǎ", english: "bank card", englishSource: "TEACHER", sourcePage: 10 });
    expect(byHanzi["参观"]).toMatchObject({ french: "visiter", frenchSource: "TEACHER", sourcePage: 2 });
    expect(byHanzi["隐私"]).toMatchObject({ english: "privacy" });
    // 13 mots des tableaux + 10 notes libres de la p. 2 (dont les gloses collées : 胶带Ruban adhésif, 法律law, 严格strict)
    expect(h.vocabulary.length).toBe(23);
    expect(byHanzi["胶带"]).toMatchObject({ french: "Ruban adhésif", sourcePage: 2 });
    expect(byHanzi["严格"]).toMatchObject({ english: "strict" });
    expect(h.grammarPoints.map((g) => g.name)).toEqual(["只要...就... (As long as...)", "万一 (In case / What if)"]);
    expect(h.sentences.find((s) => s.hanzi.startsWith("只要不带伞"))?.origin).toBe("STUDENT_PRACTICE");
    // Ligne mêlant notes et phrase : la phrase est extraite sans les notes
    const mixed = h.sentences.find((s) => s.hanzi.includes("开学之前"));
    expect(mixed?.hanzi).toBe("开学之前，需要买，每天都穿一样的衣服。");
    expect(h.lesson).toMatchObject({ title: "Mobile payment is enough", titleChinese: "手机付款就可以", date: "2026-09-07" });
    expect(h.warnings.join(" ")).toMatch(/7 page\(s\) semblent être des images/);
  });

  it("PDF réel « 聊天 » (notes de conversation, pinyin en police, gloses mêlées ou collées)", async () => {
    const { ex, h } = await heuristic("source-materials/pdf/16th-Dominique.pdf", "16th-Dominique.pdf");
    expect(ex.pageCount).toBe(2);
    expect(h.lesson).toMatchObject({ titleChinese: "聊天", date: "2026-09-25" });
    const byHanzi = Object.fromEntries(h.vocabulary.map((v) => [v.hanzi, v]));
    // Séparateur avec nature grammaticale
    expect(byHanzi["标准"]).toMatchObject({ english: "standard", partOfSpeech: "adj./n." });
    expect(byHanzi["限制"]).toMatchObject({ partOfSpeech: "v./n." });
    expect(byHanzi["限制"].french ?? byHanzi["限制"].english).toBe("limite");
    // Glose suivie de « … », gloses françaises
    expect(byHanzi["全球化"]).toMatchObject({ english: "Globalization" });
    expect(byHanzi["有限"]).toMatchObject({ french: "limité" });
    // Gloses collées aux caractères dans les phrases
    for (const w of ["庆祝", "逻辑", "连锁店", "流程化", "模版", "工具", "制作"]) expect(byHanzi[w], w).toBeDefined();
    expect(byHanzi["制作"]).toMatchObject({ partOfSpeech: "v." });
    // Pas de faux mots construits sur une particule (« 的Linear », « 一个Airpods »)
    expect(Object.keys(byHanzi).some((k) => /的$|个$/.test(k))).toBe(false);
    // La phrase annotée reste une phrase, débarrassée de ses annotations
    const annotated = h.sentences.find((s) => s.hanzi.includes("庆祝"))!;
    expect(annotated.hanzi).toContain("我想庆祝我的成绩");
    expect(annotated.hanzi).not.toMatch(/celebrate/);
  });

  it("notes libres avec gloses françaises, correction et date dans le nom", async () => {
    const { h } = await heuristic(`${SYN}/2026-09-24-notes-cours.pdf`, "2026-09-24-notes-cours.pdf");
    expect(h.lesson.title).toBe("Cours du 24 septembre");
    expect(h.lesson.date).toBe("2026-09-24");
    const byHanzi = Object.fromEntries(h.vocabulary.map((v) => [v.hanzi, v]));
    expect(byHanzi["旅行"]).toMatchObject({ french: "voyager" });
    expect(byHanzi["去年"]).toMatchObject({ french: "l'année dernière" });
    expect(byHanzi["终于"]).toMatchObject({ french: "enfin" });
    expect(h.corrections).toEqual([
      expect.objectContaining({ incorrect: "我去了北京去年", correct: "我去年去了北京" }),
    ]);
    expect(h.grammarPoints[0]).toMatchObject({ structure: "Sujet + 去过 + lieu" });
    expect(h.grammarPoints[0].examples[0]).toMatchObject({ hanzi: "我去过上海。", french: "Je suis déjà allé à Shanghai." });
  });

  it("tableau de vocabulaire en français", async () => {
    const { h } = await heuristic(`${SYN}/vocabulaire-tableau-francais.pdf`, "vocabulaire-tableau-francais.pdf");
    expect(h.vocabulary.map((v) => [v.hanzi, v.pinyin, v.french])).toEqual([
      ["机场", "jī chǎng", "aéroport"],
      ["出租车", "chū zū chē", "taxi"],
      ["下班", "xià bān", "finir le travail"],
      ["行李", "xíng li", "bagages"],
    ]);
    expect(h.vocabulary.every((v) => v.english === null && v.frenchSource === "TEACHER")).toBe(true);
  });

  it("PDF scanné sans texte : import conservé, page image signalée", async () => {
    const res = await importPdf("scan-sans-texte.pdf", read(`${SYN}/scan-sans-texte.pdf`), { analyze: false });
    process.env.AI_MOCK_FAIL = "analyze-lesson";
    try {
      await runAnalysis(res.lessonId);
    } finally {
      delete process.env.AI_MOCK_FAIL;
    }
    const draft = (await getDraft(res.lessonId))!;
    expect(draft.vocabulary).toHaveLength(0);
    expect(draft.warnings.join(" ")).toMatch(/images/);
    const doc = await prisma.sourceDocument.findFirstOrThrow({ where: { lessonId: res.lessonId } });
    expect(doc.processingStatus).toBe("EXTRACTED");
    await prisma.lesson.delete({ where: { id: res.lessonId } });
  });

  it("PDF corrompu : erreur claire, sans plantage", async () => {
    await expect(extractPdf(read(`${SYN}/corrompu.pdf`))).rejects.toBeInstanceOf(PdfExtractionError);
    const res = await importPdf("corrompu.pdf", read(`${SYN}/corrompu.pdf`));
    const lesson = await prisma.lesson.findUniqueOrThrow({ where: { id: res.lessonId } });
    expect(lesson.processingStatus).toBe("FAILED");
    expect(lesson.analysisError).toMatch(/illisible|corrompu/);
    await prisma.lesson.delete({ where: { id: res.lessonId } });
  });
});
