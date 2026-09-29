/**
 * Transcription locale (Whisper) : le moteur est simulé (aucun téléchargement de modèle).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const asrCalls: { samples: number; opts: Record<string, unknown> }[] = [];
let asrText = "我們今天學習中文, 你好嗎?";
vi.mock("@huggingface/transformers", () => ({
  env: {},
  pipeline: async () => async (audio: Float32Array, opts: Record<string, unknown>) => {
    asrCalls.push({ samples: audio.length, opts });
    return { text: asrText };
  },
}));
import { POST } from "@/app/api/transcribe/route";
import { normalizeTranscript } from "@/server/transcribe";

function post(samples: Float32Array | Uint8Array) {
  const body = samples instanceof Float32Array ? new Uint8Array(samples.buffer as ArrayBuffer) : new Uint8Array(samples);
  return POST(new Request("http://localhost/api/transcribe", { method: "POST", body }));
}

describe("transcription locale", () => {
  beforeEach(() => {
    asrCalls.length = 0;
    asrText = "我們今天學習中文, 你好嗎?";
    process.env.STT_PROVIDER = "whisper";
  });

  it("transcrit en chinois simplifié avec la ponctuation chinoise", async () => {
    const res = await post(new Float32Array(16_000 * 2));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ text: "我们今天学习中文，你好吗？" });
    expect(asrCalls[0]).toMatchObject({ samples: 32_000, opts: { language: "chinese", task: "transcribe" } });
  });

  it("refuse un audio invalide, trop court ou trop long", async () => {
    expect((await post(new Uint8Array(0))).status).toBe(400);
    expect((await post(new Uint8Array(7))).status).toBe(400);
    expect((await post(new Float32Array(1000))).status).toBe(400);
    expect((await post(new Float32Array(16_000 * 121))).status).toBe(400);
    expect(asrCalls).toHaveLength(0);
  });

  it("répond 501 quand la transcription locale est désactivée", async () => {
    process.env.STT_PROVIDER = "none";
    expect((await post(new Float32Array(16_000))).status).toBe(501);
  });

  it("normalise la sortie de Whisper", () => {
    expect(normalizeTranscript("你好 . 我叫 小明 !")).toBe("你好。我叫小明！");
    expect(normalizeTranscript("  ")).toBe("");
  });
});
