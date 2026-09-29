import { describe, expect, it } from "vitest";
import { hskDictionary, hskLookup } from "@/lib/chinese/hsk";
import { analyzeText, contextAt, coverageVerdict, tokenize } from "@/lib/resources/analyze";
import { pickNewItems, type PlanItem } from "@/lib/review/session-plan";
import { subtitlesToText } from "@/server/resource-sources";

const TEXT =
  "我觉得现在年轻人的月薪不够花，所以很多人开始做副业赚钱。有的人在网上卖东西，有的人晚上开车。副业虽然累，但是可以多一份收入。时薪也不错。";

function dictWith(known: Set<string>) {
  const hsk = hskDictionary();
  return { has: (w: string) => hsk.has(w) || known.has(w) };
}

describe("découpage en mots", () => {
  it("détache une particule collée et fusionne les mots connus", () => {
    const known = new Set(["时薪"]);
    const words = tokenize(TEXT, dictWith(known)).map((t) => t.word);
    expect(words).toContain("月薪");
    expect(words).toContain("时薪");
    expect(words).not.toContain("人的");
    expect(words).toContain("的");
    // Ponctuation et espaces exclus.
    expect(words.every((w) => /[一-鿿]/.test(w))).toBe(true);
  });

  it("donne la phrase de contexte d'un mot", () => {
    const i = TEXT.indexOf("副业");
    expect(contextAt(TEXT, i, "副业")).toBe("我觉得现在年轻人的月薪不够花，所以很多人开始做副业赚钱。");
    const long = "一".repeat(100) + "副业" + "二".repeat(100);
    const ctx = contextAt(long, 100, "副业", 30);
    expect(ctx).toContain("副业");
    expect(ctx.length).toBeLessThanOrEqual(33);
  });
});

describe("analyse de couverture", () => {
  it("considère comme connu un mot hors HSK formé de mots simples (这个)", () => {
    const text = "这个问题很难，这个办法不错。病逝的意思是因为生病而离开这个世界。";
    const known = new Set<string>();
    const a = analyzeText(text, [{ word: "这个", index: 0 }, { word: "病逝", index: text.indexOf("病逝") }], { known, hskLevel: 2, lookup: hskLookup });
    expect(a.words.find((w) => w.word === "这个")?.status).toBe("presumed");
    expect(a.words.find((w) => w.word === "病逝")?.status).toBe("new");
  });

  it("distingue mots connus, supposés connus et nouveaux", () => {
    const known = new Set(["月薪", "收入"]);
    const tokens = tokenize(TEXT, dictWith(known));
    const a = analyzeText(TEXT, tokens, { known, hskLevel: 3, lookup: hskLookup });
    const byWord = new Map(a.words.map((w) => [w.word, w]));
    expect(byWord.get("月薪")?.status).toBe("known");
    expect(byWord.get("觉得")?.status).toBe("presumed"); // HSK 1
    expect(byWord.get("副业")?.status).toBe("new");
    expect(byWord.get("副业")?.count).toBe(2);
    expect(byWord.get("副业")?.tier).toBe("useful"); // répété dans le texte
    expect(a.stats.tokens).toBe(a.stats.known + a.stats.presumed + a.stats.unknown);
    expect(a.stats.coverage).toBeGreaterThan(70);
    expect(a.stats.coverageOwn).toBeLessThan(a.stats.coverage);
  });

  it("le niveau HSK change les mots supposés connus", () => {
    const known = new Set<string>();
    const tokens = tokenize(TEXT, dictWith(known));
    const beginner = analyzeText(TEXT, tokens, { known, hskLevel: 0, lookup: hskLookup });
    const advanced = analyzeText(TEXT, tokens, { known, hskLevel: 6, lookup: hskLookup });
    expect(beginner.stats.presumed).toBe(0);
    expect(advanced.stats.coverage).toBeGreaterThan(beginner.stats.coverage);
  });

  it("ignore les nombres", () => {
    const text = "我有三百块钱。我有三百块钱。";
    const known = new Set<string>();
    const a = analyzeText(text, tokenize(text, dictWith(known)), { known, hskLevel: 0, lookup: hskLookup });
    expect(a.words.map((w) => w.word)).not.toContain("三百");
  });

  it("appréciation du taux de mots connus", () => {
    expect(coverageVerdict(70).tone).toBe("hard");
    expect(coverageVerdict(93).tone).toBe("good");
    expect(coverageVerdict(99).tone).toBe("easy");
  });
});

describe("sous-titres", () => {
  it("garde uniquement les répliques d'un fichier SRT / VTT", () => {
    const srt = "1\n00:00:01,000 --> 00:00:03,000\n<i>大家好</i>\n\n2\n00:00:03,500 --> 00:00:05,000\n今天我们聊工作\n今天我们聊工作\n";
    expect(subtitlesToText(srt)).toBe("大家好\n今天我们聊工作");
    const vtt = "WEBVTT\nKind: captions\n\n00:01.000 --> 00:02.000\n你好\n";
    expect(subtitlesToText(vtt)).toBe("你好");
  });
});

describe("nouveautés : cours prioritaires, ressources limitées", () => {
  const item = (id: string, fromCourse: boolean) => ({ id, fromCourse }) as unknown as PlanItem;
  it("réserve au plus un tiers des nouveautés aux ressources", () => {
    const list = [...["c1", "c2", "c3", "c4", "c5", "c6", "c7", "c8"].map((i) => item(i, true)), ...["r1", "r2", "r3", "r4"].map((i) => item(i, false))];
    const picked = pickNewItems(list, 8).map((i) => i.id);
    expect(picked).toHaveLength(8);
    expect(picked.filter((i) => i.startsWith("r"))).toHaveLength(2);
  });
  it("les ressources prennent les places laissées libres par les cours", () => {
    const list = [item("c1", true), ...["r1", "r2", "r3", "r4", "r5"].map((i) => item(i, false))];
    expect(pickNewItems(list, 4).map((i) => i.id)).toEqual(["c1", "r1", "r2", "r3"]);
  });
  it("une seule place : elle va au cours", () => {
    expect(pickNewItems([item("r1", false), item("c1", true)], 1).map((i) => i.id)).toEqual(["c1"]);
  });
});
