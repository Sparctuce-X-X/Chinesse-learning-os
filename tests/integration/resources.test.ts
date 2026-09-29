/**
 * Ressources externes : import (texte, document, page web), tri des mots, validation avec
 * provenance « ressource » (jamais la professeure), mots déclarés connus, repli sans IA.
 */
import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/db/prisma";
import { getDraft, startAnalysis, validateLesson } from "@/server/lessons";
import { createResource, getResourceAnalysis, knownWords, setWordKnown } from "@/server/resources";
import { extractArticle, extractDocument, fetchArticle, normalizeResourceText, ResourceError } from "@/server/resource-sources";
import { loadPlanItems } from "@/server/review";
import { getUserId } from "@/server/user";

const TEXT = `年轻人的副业
现在很多年轻人觉得月薪不够花，所以开始做副业赚钱。有的人在网上开店，有的人晚上送外卖。
副业虽然很累，但是可以多一份收入，也能学到新的技能。专家提醒，做副业之前要先想清楚自己的时间和精力。`;

async function importText(text: string, title?: string) {
  const { lessonId, duplicateOf } = await createResource({ kind: "TEXT", text, title });
  await startAnalysis(lessonId);
  return { lessonId, duplicateOf };
}

describe("import d'un texte et tri des mots", () => {
  let lessonId: string;

  it("analyse le texte et propose les mots nouveaux utiles", async () => {
    ({ lessonId } = await importText(TEXT, "Les petits boulots"));
    const lesson = await prisma.lesson.findUniqueOrThrow({ where: { id: lessonId }, include: { resource: true } });
    expect(lesson.kind).toBe("RESOURCE");
    expect(lesson.processingStatus).toBe("READY_FOR_REVIEW");
    expect(lesson.extractionMethod).toBe("AI");
    expect(lesson.resource?.kind).toBe("TEXT");

    const draft = (await getDraft(lessonId))!;
    const fuye = draft.vocabulary.find((v) => v.hanzi === "副业")!;
    expect(fuye).toBeTruthy();
    expect(fuye.resource).toMatchObject({ tier: "useful", count: 4 });
    expect(fuye.decision).toBe("approved");
    expect(fuye.frenchSource).toBe("AI");
    expect(fuye.examples[0].source).toBe("EXTERNAL");
    expect(fuye.examples[0].hanzi).toContain("副业");
    // Les mots très simples (HSK ≤ 2 par défaut) ne sont pas proposés.
    expect(draft.vocabulary.find((v) => v.hanzi === "觉得")).toBeUndefined();
    // Jamais plus de 15 mots cochés d'office.
    expect(draft.vocabulary.filter((v) => v.decision === "approved").length).toBeLessThanOrEqual(15);
  });

  it("la ressource n'apparaît pas dans l'historique des cours", async () => {
    const courses = await prisma.lesson.findMany({ where: { kind: "COURSE" }, select: { id: true } });
    expect(courses.map((c) => c.id)).not.toContain(lessonId);
  });

  it("valide : connaissances marquées « ressource », jamais « professeure »", async () => {
    const before = (await getResourceAnalysis(lessonId))!.analysis.stats.coverageOwn;
    const summary = await validateLesson(lessonId, { title: "Les petits boulots", date: "2026-09-28" });
    expect(summary.created).toBeGreaterThan(0);

    const links = await prisma.lessonKnowledge.findMany({
      where: { lessonId },
      include: { knowledgeItem: { include: { vocabulary: true, examples: true } } },
    });
    expect(links.length).toBe(summary.created + summary.merged);
    for (const l of links) {
      const k = l.knowledgeItem;
      expect(k.sourceType).toBe("EXTERNAL");
      expect(k.vocabulary?.frenchSource).not.toBe("TEACHER");
      expect(k.vocabulary?.englishSource).not.toBe("TEACHER");
      expect(k.vocabulary?.pinyinSource).not.toBe("TEACHER");
      for (const e of k.examples) {
        expect(e.sourceType).toBe("EXTERNAL");
        if (e.french) expect(e.translationSource).toBe("AI");
      }
    }
    // Les mots ajoutés comptent maintenant comme connus.
    const after = (await getResourceAnalysis(lessonId))!.analysis.stats.coverageOwn;
    expect(after).toBeGreaterThan(before);

    // Priorité : ces mots viennent uniquement d'une ressource.
    const userId = await getUserId();
    const plan = await loadPlanItems(userId);
    const item = plan.find((p) => p.hanzi === "副业")!;
    expect(item.fromCourse).toBe(false);
  });

  it("« Choisir d'autres mots » ne repropose pas les mots déjà ajoutés", async () => {
    await startAnalysis(lessonId, "auto");
    const draft = (await getDraft(lessonId))!;
    expect(draft.vocabulary.find((v) => v.hanzi === "副业")).toBeUndefined();
  });

  it("un mot déclaré connu n'est plus proposé", async () => {
    const userId = await getUserId();
    const first = (await getDraft(lessonId))!;
    const word = first.vocabulary[0].hanzi;
    await setWordKnown(word, true);
    expect((await knownWords(userId)).has(word)).toBe(true);
    const { lessonId: second, duplicateOf } = await importText(TEXT);
    expect(duplicateOf?.title).toBeTruthy();
    const draft = (await getDraft(second))!;
    expect(draft.vocabulary.find((v) => v.hanzi === word)).toBeUndefined();
    await setWordKnown(word, false);
    expect(await prisma.knownWord.count({ where: { userId, hanzi: word } })).toBe(0);
  });
});

describe("sans IA", () => {
  it("utilise le dictionnaire HSK (anglais, provenance « ressource ») et le signale", async () => {
    process.env.AI_MOCK_FAIL = "enrich-resource";
    try {
      const { lessonId } = await importText("我们公司最近在招聘程序员，工资很高，但是加班也很多。程序员的压力很大。");
      const lesson = await prisma.lesson.findUniqueOrThrow({ where: { id: lessonId } });
      expect(lesson.processingStatus).toBe("READY_FOR_REVIEW");
      expect(lesson.extractionMethod).toBe("HEURISTIC");
      const draft = (await getDraft(lessonId))!;
      expect(draft.warnings.some((w) => /dictionnaire HSK/.test(w))).toBe(true);
      const withMeaning = draft.vocabulary.find((v) => v.english);
      expect(withMeaning?.englishSource).toBe("EXTERNAL");
      expect(withMeaning?.french).toBeNull();
    } finally {
      delete process.env.AI_MOCK_FAIL;
    }
  });
});

describe("sources", () => {
  it("convertit le chinois traditionnel en simplifié", async () => {
    const s = await normalizeResourceText("現在很多年輕人覺得月薪不夠花，所以開始做副業賺錢。");
    expect(s.convertedFromTraditional).toBe(true);
    expect(s.text).toContain("现在很多年轻人觉得");
  });

  it("retire les lignes de références bibliographiques", async () => {
    const s = await normalizeResourceText("北京烤鸭是一道非常有名的中国菜。\n^ 北京烤鸭的历史. 新闻网. [2020-01-01]. （原始内容存档于2020-02-01）.\n烤鸭很好吃，外国游客都喜欢。");
    expect(s.text).toBe("北京烤鸭是一道非常有名的中国菜。\n烤鸭很好吃，外国游客都喜欢。");
  });

  it("refuse un contenu sans chinois", async () => {
    await expect(normalizeResourceText("Hello world, this is English only.")).rejects.toThrow(ResourceError);
  });

  it("lit les fichiers texte et sous-titres, refuse les autres formats", async () => {
    const enc = new TextEncoder();
    const txt = await extractDocument("article.txt", enc.encode(TEXT));
    expect(txt.title).toBe("article");
    const srt = await extractDocument("video.srt", enc.encode("1\n00:00:01,000 --> 00:00:03,000\n" + TEXT.split("\n")[1] + "\n"));
    expect(srt.text).not.toContain("-->");
    await expect(extractDocument("photo.jpg", enc.encode("x"))).rejects.toThrow(/Format non pris en charge/);
  });

  it("extrait le texte principal d'une page web", async () => {
    const html = `<!doctype html><html><head><title>副业热潮 - 新闻网</title><meta charset="utf-8"></head><body>
      <nav>首页 新闻 体育 登录</nav>
      <article><h1>副业热潮</h1>${TEXT.split("\n").map((p) => `<p>${p}</p>`).join("")}</article>
      <footer>版权所有</footer></body></html>`;
    const a = await extractArticle(html, "https://www.example.com/news/1");
    expect(a.text).toContain("副业虽然很累");
    expect(a.text).not.toContain("版权所有");
    expect(a.title).toContain("副业热潮");
    expect(a.siteName).toBeTruthy();
  });

  it("les vidéos hors YouTube sont signalées comme non prises en charge", async () => {
    await expect(fetchArticle("https://www.bilibili.com/video/BV1xx411c7mD")).rejects.toThrow(/Seules les vidéos YouTube/);
    await expect(fetchArticle("ftp://exemple.com/a")).rejects.toThrow(/http/);
    await expect(fetchArticle("pas un lien")).rejects.toThrow(/pas valide/);
  });
});
