import { describe, expect, it } from "vitest";
import { activeSegment, formatTime, parseJson3, segmentAt, segmentOffsets, segmentParts, segmentsText, youTubeId } from "@/lib/resources/video";

describe("vidéos YouTube", () => {
  it("reconnaît les différentes formes de lien", () => {
    const id = "3_XZvOwqG34";
    for (const u of [
      `https://www.youtube.com/watch?v=${id}&t=42s`,
      `https://m.youtube.com/watch?v=${id}`,
      `https://youtu.be/${id}?si=abc`,
      `https://www.youtube.com/shorts/${id}`,
      `https://www.youtube.com/embed/${id}`,
      `https://www.youtube.com/live/${id}`,
    ]) {
      expect(youTubeId(new URL(u))).toBe(id);
    }
    expect(youTubeId(new URL("https://www.youtube.com/@chaine"))).toBeNull();
    expect(youTubeId(new URL("https://example.com/watch?v=3_XZvOwqG34"))).toBeNull();
  });

  it("lit les sous-titres json3 (lignes vides et doublons ignorés)", () => {
    const segs = parseJson3({
      events: [
        { tStartMs: 0, dDurationMs: 1000 },
        { tStartMs: 1000, dDurationMs: 2000, segs: [{ utf8: "大家好，" }, { utf8: "欢迎收看" }] },
        { tStartMs: 3000, dDurationMs: 500, segs: [{ utf8: "\n" }] },
        { tStartMs: 3500, dDurationMs: 1500, segs: [{ utf8: "今天的新闻" }] },
        { tStartMs: 5000, dDurationMs: 1000, segs: [{ utf8: "今天的新闻" }] },
      ],
    });
    expect(segs).toEqual([
      { s: 1, e: 3, t: "大家好，欢迎收看" },
      { s: 3.5, e: 6, t: "今天的新闻" },
    ]);
  });

  it("retrouve la réplique d'une position du texte et d'un instant", () => {
    const segs = [
      { s: 1, e: 3, t: "大家好" },
      { s: 4, e: 6, t: "今天天气很好" },
      { s: 7, e: 9, t: "我们去公园" },
    ];
    const text = segmentsText(segs);
    const offsets = segmentOffsets(segs);
    expect(segmentAt(offsets, text.indexOf("天气"))).toBe(1);
    expect(segmentAt(offsets, text.indexOf("公园"))).toBe(2);
    expect(activeSegment(segs, 0.5)).toBe(-1);
    expect(activeSegment(segs, 4.2)).toBe(1);
    expect(activeSegment(segs, 6.5)).toBe(1);
    expect(activeSegment(segs, 100)).toBe(2);
  });

  it("découpe les répliques en mots cliquables", () => {
    const segs = [
      { s: 0, e: 1, t: "你好，朋友" },
      { s: 1, e: 2, t: "再见" },
    ];
    const text = segmentsText(segs);
    const tokens = ["你好", "朋友", "再见"].map((word) => ({ word, index: text.indexOf(word) }));
    expect(segmentParts(segs, tokens)).toEqual([[["你好"], "，", ["朋友"]], [["再见"]]]);
  });

  it("formate les durées", () => {
    expect(formatTime(0)).toBe("0:00");
    expect(formatTime(83.9)).toBe("1:23");
    expect(formatTime(3725)).toBe("1:02:05");
  });
});

describe("transcription Whisper", () => {
  it("supprime les répétitions en boucle", async () => {
    const { collapseRepeats } = await import("@/server/transcribe");
    expect(collapseRepeats("您会得到所有的评论，订阅，订阅，订阅，订阅，订阅，订")).toBe("您会得到所有的评论，订阅订");
    expect(collapseRepeats("谢谢谢谢，你好")).toBe("谢谢谢谢，你好");
  });
});
