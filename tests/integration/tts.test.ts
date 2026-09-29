/**
 * Synthèse vocale serveur (Edge par défaut, Google en option) :
 * les services externes sont simulés (aucun appel réseau).
 */
import { existsSync } from "node:fs";
import { EventEmitter } from "node:events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const edgeCalls: { voice: string; text: string; rate: unknown }[] = [];
let edgeFail = false;
vi.mock("msedge-tts", () => {
  class MsEdgeTTS {
    private voice = "";
    async setMetadata(voice: string) {
      this.voice = voice;
    }
    toStream(text: string, opts: { rate?: unknown }) {
      edgeCalls.push({ voice: this.voice, text, rate: opts?.rate });
      const audioStream = new EventEmitter();
      setTimeout(() => {
        if (edgeFail) audioStream.emit("error", new Error("socket fermé"));
        else {
          audioStream.emit("data", Buffer.from("EDGE-MP3"));
          audioStream.emit("close");
        }
      }, 5);
      return { audioStream };
    }
    close() {}
  }
  return { MsEdgeTTS, OUTPUT_FORMAT: { AUDIO_24KHZ_48KBITRATE_MONO_MP3: "mp3" } };
});
import { GET } from "@/app/api/tts/route";
import { pregenerateLessonAudio, synthesize, TtsError } from "@/server/tts";
import { prisma } from "@/lib/db/prisma";
import { getUserId } from "@/server/user";

const FAKE_MP3 = Buffer.from("ID3-fake-mp3-audio");

function mockGoogle(status = 200) {
  const fetchMock = vi.fn<(url: string | URL | Request, init?: RequestInit) => Promise<Response>>(async () =>
    status === 200
      ? new Response(JSON.stringify({ audioContent: FAKE_MP3.toString("base64") }), { status: 200 })
      : new Response(JSON.stringify({ error: { message: "quota" } }), { status }),
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

const unique = () => `你好${Math.random().toString(36).slice(2, 8)}`;

beforeEach(() => {
  process.env.TTS_PROVIDER = "google";
  process.env.GOOGLE_TTS_API_KEY = "test-key";
  edgeCalls.length = 0;
  edgeFail = false;
});
afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.GOOGLE_TTS_API_KEY;
  process.env.TTS_PROVIDER = "none";
});

describe("synthèse Edge (fournisseur par défaut, sans clé)", () => {
  beforeEach(() => {
    delete process.env.TTS_PROVIDER;
    delete process.env.GOOGLE_TTS_API_KEY;
  });

  it("utilise une voix zh-CN Edge, échappe le texte et met en cache", async () => {
    const text = `${unique()} <b>&</b>`;
    const a = await synthesize(text, { voice: "zh-CN-YunxiNeural", speed: "slow" });
    const b = await synthesize(text, { voice: "zh-CN-YunxiNeural", speed: "slow" });
    expect(a.toString()).toBe("EDGE-MP3");
    expect(b.toString()).toBe("EDGE-MP3");
    expect(edgeCalls).toHaveLength(1);
    expect(edgeCalls[0]).toMatchObject({ voice: "zh-CN-YunxiNeural", rate: 0.7 });
    expect(edgeCalls[0].text).toContain("&lt;b&gt;&amp;&lt;/b&gt;");
  });

  it("voix inconnue ou d'un autre fournisseur : voix Edge par défaut (Xiaoxiao)", async () => {
    await synthesize(unique(), { voice: "Kore" });
    expect(edgeCalls[0].voice).toBe("zh-CN-XiaoxiaoNeural");
  });

  it("panne du service Edge : erreur propre (le navigateur prendra le relais)", async () => {
    edgeFail = true;
    await expect(synthesize(unique())).rejects.toMatchObject({ code: "PROVIDER_ERROR" });
    const res = await GET(new Request(`http://localhost/api/tts?text=${encodeURIComponent(unique())}`));
    expect(res.status).toBe(502);
  });

  it("TTS_PROVIDER=none : pas de synthèse serveur (501)", async () => {
    process.env.TTS_PROVIDER = "none";
    const res = await GET(new Request(`http://localhost/api/tts?text=${encodeURIComponent(unique())}`));
    expect(res.status).toBe(501);
    expect(edgeCalls).toHaveLength(0);
  });
});

describe("synthèse Google Chirp 3 HD", () => {
  it("appelle Google avec la voix cmn-CN Chirp 3 HD, puis sert le cache disque", async () => {
    const fetchMock = mockGoogle();
    const text = unique();
    const a = await synthesize(text, { voice: "Puck", speed: "slow" });
    const b = await synthesize(text, { voice: "Puck", speed: "slow" });
    expect(a.equals(FAKE_MP3)).toBe(true);
    expect(b.equals(FAKE_MP3)).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe("https://texttospeech.googleapis.com/v1/text:synthesize");
    expect((init!.headers as Record<string, string>)["X-Goog-Api-Key"]).toBe("test-key");
    const body = JSON.parse(String(init!.body));
    expect(body.voice).toEqual({ languageCode: "cmn-CN", name: "cmn-CN-Chirp3-HD-Puck" });
    expect(body.audioConfig).toEqual({ audioEncoding: "MP3", speakingRate: 0.7 });
    expect(body.input.text).toBe(text);
  });

  it("requêtes simultanées pour le même texte : un seul appel à Google", async () => {
    const fetchMock = mockGoogle();
    const text = unique();
    await Promise.all([synthesize(text), synthesize(text), synthesize(text)]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("une voix ou une vitesse différente produit un autre fichier", async () => {
    const fetchMock = mockGoogle();
    const text = unique();
    await synthesize(text, { voice: "Kore" });
    await synthesize(text, { voice: "Charon" });
    await synthesize(text, { voice: "Kore", speed: "slow" });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("google sans clé : synthèse serveur désactivée (NOT_CONFIGURED)", async () => {
    mockGoogle();
    delete process.env.GOOGLE_TTS_API_KEY;
    await expect(synthesize(unique())).rejects.toMatchObject({ code: "NOT_CONFIGURED" });
  });

  it("quota atteint et texte invalide", async () => {
    mockGoogle(429);
    await expect(synthesize(unique())).rejects.toMatchObject({ code: "QUOTA" });
    await expect(synthesize("   ")).rejects.toBeInstanceOf(TtsError);
    await expect(synthesize("好".repeat(401))).rejects.toMatchObject({ code: "INVALID_TEXT" });
  });
});

describe("route /api/tts", () => {
  it("renvoie un MP3 mis en cache par le navigateur", async () => {
    mockGoogle();
    const res = await GET(new Request(`http://localhost/api/tts?text=${encodeURIComponent(unique())}&voice=Leda`));
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("audio/mpeg");
    expect(res.headers.get("Cache-Control")).toContain("immutable");
  });

  it("501 sans clé (le navigateur prend le relais), 400 pour un texte vide", async () => {
    delete process.env.GOOGLE_TTS_API_KEY;
    const res = await GET(new Request(`http://localhost/api/tts?text=${encodeURIComponent(unique())}`));
    expect(res.status).toBe(501);
    process.env.GOOGLE_TTS_API_KEY = "test-key";
    expect((await GET(new Request("http://localhost/api/tts?text="))).status).toBe(400);
  });
});

describe("pré-génération à la validation d'un cours", () => {
  it("génère l'audio du vocabulaire et des phrases du cours", async () => {
    const fetchMock = mockGoogle();
    const userId = await getUserId();
    const lesson = await prisma.lesson.create({
      data: { userId, title: "Audio", date: new Date(), topics: [], analysisWarnings: [], processingStatus: "VALIDATED" },
    });
    for (const hanzi of [unique(), unique()]) {
      const k = await prisma.knowledgeItem.create({
        data: { userId, type: "VOCABULARY", sourceType: "USER", canonicalKey: `VOCABULARY:${hanzi}`, vocabulary: { create: { hanzi } } },
      });
      await prisma.lessonKnowledge.create({ data: { lessonId: lesson.id, knowledgeItemId: k.id } });
    }
    const res = await pregenerateLessonAudio(lesson.id);
    expect(res).toEqual({ generated: 2, failed: 0 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(existsSync(".data-test/tts")).toBe(true);
  });
});
