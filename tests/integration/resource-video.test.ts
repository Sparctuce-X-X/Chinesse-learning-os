/**
 * Vidéos YouTube : sous-titres (auteur ou automatiques), transcription Whisper quand il n'y en a pas,
 * horodatage des mots et données du lecteur. YouTube, yt-dlp et Whisper sont simulés.
 */
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db/prisma";
import { getDraft, startAnalysis } from "@/server/lessons";
import { createResource, getReaderData } from "@/server/resources";

const tools = vi.hoisted(() => ({ available: true, transcribed: 0 }));

vi.mock("@/server/youtube", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/server/youtube")>();
  return {
    ...real,
    transcriptionToolsStatus: async () => ({ ytDlp: tools.available, ffmpeg: tools.available }),
    downloadAudio: async () => new Float32Array(16_000 * 30),
  };
});
vi.mock("@/server/transcribe", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/server/transcribe")>();
  return {
    ...real,
    transcribeLong: async (_s: Float32Array, onProgress?: (d: number) => void) => {
      tools.transcribed++;
      onProgress?.(1);
      return [
        { s: 0, e: 4, t: "歡迎收看華語新聞" },
        { s: 4, e: 9, t: "今天我们来聊聊地铁上的乘客" },
        { s: 9, e: 15, t: "早上乘客非常多，每个乘客都很累" },
      ];
    },
  };
});

const LINES = [
  "大家好，欢迎收看今天的节目",
  "四川的山里住着很多野生动物",
  "其中最有名的就是熊猫",
  "熊猫每天要吃很多竹子，睡很长时间",
  "为了保护熊猫，政府建了很多保护区",
];

function player(id: string, tracks: { languageCode: string; kind?: string }[]) {
  return {
    playabilityStatus: { status: "OK" },
    videoDetails: { videoId: id, title: "熊猫的一天", author: "中文频道", lengthSeconds: "95" },
    captions: tracks.length
      ? { playerCaptionsTracklistRenderer: { captionTracks: tracks.map((t) => ({ ...t, baseUrl: `https://www.youtube.com/api/timedtext?v=${id}&lang=${t.languageCode}` })) } }
      : undefined,
  };
}

const realFetch = globalThis.fetch;
let tracksFor: Record<string, { languageCode: string; kind?: string }[]> = {};
const requested: string[] = [];

beforeEach(() => {
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    if (url.includes("/youtubei/v1/player")) {
      const { videoId } = JSON.parse(String(init?.body)) as { videoId: string };
      return Response.json(player(videoId, tracksFor[videoId] ?? []));
    }
    if (url.includes("/api/timedtext")) {
      requested.push(url);
      return Response.json({ events: LINES.map((t, i) => ({ tStartMs: i * 3000 + 500, dDurationMs: 2800, segs: [{ utf8: t }] })) });
    }
    return realFetch(input, init);
  });
});
afterAll(() => vi.restoreAllMocks());

describe("import d'une vidéo YouTube", () => {
  it("utilise les sous-titres chinois de l'auteur en priorité et horodate les mots", async () => {
    tracksFor = { AAAAAAAAAA1: [{ languageCode: "en" }, { languageCode: "zh-Hans", kind: "asr" }, { languageCode: "zh-Hans" }] };
    const { lessonId } = await createResource({ kind: "VIDEO", url: "https://youtu.be/AAAAAAAAAA1?si=x" });
    await startAnalysis(lessonId);
    const lesson = await prisma.lesson.findUniqueOrThrow({ where: { id: lessonId }, include: { resource: true } });
    expect(lesson.processingStatus).toBe("READY_FOR_REVIEW");
    expect(lesson.resource).toMatchObject({ kind: "VIDEO", mediaId: "AAAAAAAAAA1", url: "https://www.youtube.com/watch?v=AAAAAAAAAA1", siteName: "中文频道", durationSec: 95, transcriptSource: "CAPTIONS" });
    expect(requested.at(-1)).toContain("lang=zh-Hans");
    expect(requested.at(-1)).toContain("fmt=json3");
    expect(requested.at(-1)).not.toContain("kind=asr");

    const draft = (await getDraft(lessonId))!;
    const panda = draft.vocabulary.find((v) => v.hanzi === "熊猫")!;
    // Première apparition : 3e réplique, à 6,5 s.
    expect(panda.resource?.time).toBe(6.5);

    const reader = (await getReaderData(lessonId, draft))!;
    expect(reader.videoId).toBe("AAAAAAAAAA1");
    expect(reader.segments).toHaveLength(LINES.length);
    expect(reader.segments[2].parts).toContainEqual(["熊猫"]);
    expect(reader.words["熊猫"]).toMatchObject({ status: "new", meaningSource: "AI" });
    expect(reader.words["大家"]?.status).not.toBe("new");
  });

  it("se rabat sur les sous-titres automatiques et le signale", async () => {
    tracksFor = { AAAAAAAAAA2: [{ languageCode: "zh", kind: "asr" }] };
    const { lessonId } = await createResource({ kind: "ARTICLE", url: "https://www.youtube.com/watch?v=AAAAAAAAAA2" });
    await startAnalysis(lessonId);
    const lesson = await prisma.lesson.findUniqueOrThrow({ where: { id: lessonId }, include: { resource: true } });
    expect(lesson.resource?.transcriptSource).toBe("AUTO_CAPTIONS");
    expect((await getDraft(lessonId))!.warnings.some((w) => /sous-titres automatiques/.test(w))).toBe(true);
  });

  it("signale un doublon", async () => {
    tracksFor = { AAAAAAAAAA1: [{ languageCode: "zh-CN" }] };
    const { duplicateOf, lessonId } = await createResource({ kind: "VIDEO", url: "https://www.youtube.com/watch?v=AAAAAAAAAA1" });
    expect(duplicateOf).not.toBeNull();
    await startAnalysis(lessonId);
  });

  it("sans sous-titres : transcription Whisper puis analyse", async () => {
    tracksFor = {};
    const before = tools.transcribed;
    const { lessonId } = await createResource({ kind: "VIDEO", url: "https://www.youtube.com/watch?v=AAAAAAAAAA3" });
    const created = await prisma.lesson.findUniqueOrThrow({ where: { id: lessonId }, include: { resource: true } });
    expect(created.processingStatus).toBe("EXTRACTING");
    expect(created.resource?.transcriptSource).toBe("WHISPER");
    await startAnalysis(lessonId);
    expect(tools.transcribed).toBe(before + 1);
    const lesson = await prisma.lesson.findUniqueOrThrow({ where: { id: lessonId }, include: { resource: true } });
    expect(lesson.processingStatus).toBe("READY_FOR_REVIEW");
    // Transcription convertie en simplifié, répliques horodatées.
    expect(lesson.resource?.text.startsWith("欢迎收看华语新闻")).toBe(true);
    expect(lesson.resource?.convertedFromTraditional).toBe(true);
    expect((lesson.resource?.segments as unknown[]).length).toBe(3);
    const draft = (await getDraft(lessonId))!;
    expect(draft.warnings.some((w) => /Whisper/.test(w))).toBe(true);
    expect(draft.vocabulary.find((v) => v.hanzi === "乘客")?.resource?.time).toBe(4);
  });

  it("sans sous-titres ni outils de transcription : message clair", async () => {
    tracksFor = {};
    tools.available = false;
    try {
      await expect(createResource({ kind: "VIDEO", url: "https://www.youtube.com/watch?v=AAAAAAAAAA4" })).rejects.toThrow(/brew install yt-dlp ffmpeg/);
    } finally {
      tools.available = true;
    }
  });

  it("refuse un lien qui n'est pas une vidéo YouTube", async () => {
    await expect(createResource({ kind: "VIDEO", url: "https://example.com/video" })).rejects.toThrow(/pas une vidéo YouTube/);
  });
});
