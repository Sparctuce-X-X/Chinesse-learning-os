import { describe, expect, it } from "vitest";
import { applyTone, comparePinyin, looksLikePinyin, numberedToMarked, parseSyllables, toneless } from "@/lib/chinese/pinyin";
import { glossMatches, normalizeGloss, normalizeHanzi, segmentChinese, canonicalKey } from "@/lib/chinese/text";

describe("pinyin", () => {
  it("place les tons selon les règles", () => {
    expect(applyTone("hao", 3)).toBe("hǎo");
    expect(applyTone("lv", 3)).toBe("lǚ");
    expect(applyTone("xiu", 4)).toBe("xiù");
    expect(applyTone("gou", 3)).toBe("gǒu");
    expect(applyTone("gui", 4)).toBe("guì");
  });

  it("convertit les tons numériques", () => {
    expect(numberedToMarked("lv3 xing2")).toBe("lǚ xíng");
    expect(numberedToMarked("ni3hao3")).toBe("nǐhǎo");
    expect(numberedToMarked("ma5")).toBe("ma");
  });

  it("découpe les syllabes collées", () => {
    expect(parseSyllables("lǚxíng")).toEqual([
      { base: "lü", tone: 3 },
      { base: "xing", tone: 2 },
    ]);
    expect(parseSyllables("yín háng kǎ").map((s) => s.base)).toEqual(["yin", "hang", "ka"]);
    expect(parseSyllables("yinhangka").map((s) => s.base)).toEqual(["yin", "hang", "ka"]);
    expect(toneless("Fù Kuǎn")).toBe("fukuan");
  });

  it("compare les réponses pinyin", () => {
    expect(comparePinyin("lǚxíng", "lǚ xíng")).toEqual({ kind: "exact" });
    expect(comparePinyin("lv3xing2", "lǚ xíng")).toEqual({ kind: "exact" });
    expect(comparePinyin("lvxing", "lǚ xíng")).toEqual({ kind: "tones_missing" });
    expect(comparePinyin("lü2 xing2", "lǚ xíng")).toEqual({ kind: "wrong_tones", positions: [0] });
    expect(comparePinyin("luxing", "lǚ xíng")).toEqual({ kind: "wrong_syllables" });
    // Ton neutre : l'absence de ton est acceptée
    expect(comparePinyin("shu1 fu", "shū fu")).toEqual({ kind: "exact" });
  });

  it("reconnaît le pinyin", () => {
    expect(looksLikePinyin("lǚ xíng")).toBe(true);
    expect(looksLikePinyin("lv3xing2")).toBe(true);
    expect(looksLikePinyin("旅行")).toBe(false);
  });
});

describe("texte", () => {
  it("normalise le chinois", () => {
    expect(normalizeHanzi(" 我喜欢，旅行。 ")).toBe("我喜欢旅行");
  });

  it("normalise et compare les gloses", () => {
    expect(normalizeGloss("Le mot de passe")).toBe("mot passe");
    expect(glossMatches("mot de passe", "mot de passe, code")).toBe(true);
    expect(glossMatches("code", "mot de passe, code")).toBe(true);
    expect(glossMatches("télécharger", "telecharger")).toBe(true);
    expect(glossMatches("telechager", "télécharger")).toBe(true);
    expect(glossMatches("to pay", "payer", "to pay")).toBe(true);
    expect(glossMatches("pay", null, "to pay")).toBe(true);
    expect(glossMatches("voiture", "voyager / voyage")).toBe(false);
    expect(glossMatches("", "voyager")).toBe(false);
  });

  it("segmente une phrase", () => {
    const seg = segmentChinese("我喜欢去中国旅行");
    expect(seg.join("")).toBe("我喜欢去中国旅行");
    expect(seg.length).toBeGreaterThanOrEqual(3);
  });

  it("génère des clés canoniques", () => {
    expect(canonicalKey("VOCABULARY", " 旅行 ")).toBe("VOCABULARY:旅行");
    expect(canonicalKey("SENTENCE", "我喜欢旅行。")).toBe("SENTENCE:我喜欢旅行");
  });
});
