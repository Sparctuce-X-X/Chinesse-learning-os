import "server-only";
import { join } from "node:path";
import { dataDir } from "./storage";

/**
 * Transcription chinoise locale avec Whisper (transformers.js + onnxruntime, sur le processeur).
 * Gratuite, sans compte, sans envoi de l'audio à un service tiers. Le modèle (~250 Mo) est
 * téléchargé une seule fois dans DATA_DIR/models/ au premier usage, puis fonctionne hors ligne.
 *
 * STT_PROVIDER : whisper (défaut) | none. Modèle : WHISPER_MODEL (défaut onnx-community/whisper-small).
 */

export const TRANSCRIBE_SAMPLE_RATE = 16_000;
export const TRANSCRIBE_MAX_SECONDS = 120;

export class TranscribeError extends Error {
  constructor(
    message: string,
    public readonly code: "NOT_CONFIGURED" | "INVALID_AUDIO" | "ENGINE_ERROR",
  ) {
    super(message);
    this.name = "TranscribeError";
  }
}

export function isLocalSttEnabled(): boolean {
  return (process.env.STT_PROVIDER || "whisper").toLowerCase() === "whisper";
}

type Asr = (audio: Float32Array, opts: Record<string, unknown>) => Promise<{ text: string } | { text: string }[]>;
type Convert = (s: string) => string;

const g = globalThis as unknown as { __whisper?: Promise<Asr>; __t2s?: Promise<Convert> };

function loadModel(): Promise<Asr> {
  if (!g.__whisper) {
    g.__whisper = (async () => {
      const { pipeline, env } = await import("@huggingface/transformers");
      env.cacheDir = join(dataDir(), "models");
      const model = process.env.WHISPER_MODEL || "onnx-community/whisper-small";
      return (await pipeline("automatic-speech-recognition", model, { dtype: "q8" })) as unknown as Asr;
    })();
    // Un échec (réseau au premier téléchargement…) ne doit pas rester en cache.
    g.__whisper.catch(() => (g.__whisper = undefined));
  }
  return g.__whisper;
}

function loadConverter(): Promise<Convert> {
  if (!g.__t2s) g.__t2s = import("opencc-js/t2cn").then((m) => m.Converter({ from: "t", to: "cn" }));
  return g.__t2s;
}

/** Whisper mélange parfois caractères traditionnels et ponctuation ASCII : on normalise. */
export function normalizeTranscript(text: string, toSimplified: Convert = (s) => s): string {
  return toSimplified(text)
    .replace(/\s*,\s*/g, "，")
    .replace(/\s*\?\s*/g, "？")
    .replace(/\s*!\s*/g, "！")
    .replace(/(?<=[一-鿿])\s*\.\s*/g, "。")
    .replace(/(?<=[一-鿿])\s+(?=[一-鿿])/g, "")
    .trim();
}

/** Transcrit de l'audio mono 16 kHz (échantillons flottants entre -1 et 1). */
export async function transcribe(samples: Float32Array): Promise<string> {
  if (!isLocalSttEnabled()) throw new TranscribeError("Transcription locale désactivée.", "NOT_CONFIGURED");
  if (samples.length < TRANSCRIBE_SAMPLE_RATE * 0.3) throw new TranscribeError("Enregistrement trop court.", "INVALID_AUDIO");
  if (samples.length > TRANSCRIBE_SAMPLE_RATE * TRANSCRIBE_MAX_SECONDS) throw new TranscribeError("Enregistrement trop long.", "INVALID_AUDIO");
  let raw: string;
  try {
    const asr = await loadModel();
    const out = await asr(samples, {
      language: "chinese",
      task: "transcribe",
      chunk_length_s: 30,
      stride_length_s: 5,
    });
    raw = (Array.isArray(out) ? out.map((o) => o.text).join("") : out.text) ?? "";
  } catch (err) {
    throw new TranscribeError(
      `Transcription impossible (${err instanceof Error ? err.message.slice(0, 160) : "moteur"}).`,
      "ENGINE_ERROR",
    );
  }
  return normalizeTranscript(raw, await loadConverter());
}

// ─── Transcription longue (vidéos) ────────────────────────────────────────────

export interface TimedText {
  s: number;
  e: number;
  t: string;
}

/**
 * Whisper « hallucine » parfois une même courte phrase en boucle (订阅，订阅，订阅…) :
 * au-delà de 3 répétitions d'affilée, on n'en garde qu'une.
 */
export function collapseRepeats(text: string): string {
  return text.replace(/(.{2,8}?)(?:[，,、。 ]?\1){3,}[，,、。]?/g, "$1");
}

/** Point de coupe le plus silencieux (fenêtre de 0,2 s) entre `from` et `to` (en échantillons). */
function quietestCut(samples: Float32Array, from: number, to: number): number {
  const win = Math.round(TRANSCRIBE_SAMPLE_RATE * 0.2);
  let best = to;
  let bestEnergy = Infinity;
  for (let start = from; start + win <= Math.min(to, samples.length); start += win) {
    let e = 0;
    for (let i = start; i < start + win; i++) e += samples[i] * samples[i];
    if (e < bestEnergy) {
      bestEnergy = e;
      best = start + (win >> 1);
    }
  }
  return best;
}

/**
 * Transcrit un long enregistrement avec horodatage, par blocs d'environ 2 minutes coupés dans un
 * silence (progression réelle, pas de mot coupé en deux entre deux blocs dans la plupart des cas).
 */
export async function transcribeLong(samples: Float32Array, onProgress?: (done: number) => void): Promise<TimedText[]> {
  if (!isLocalSttEnabled()) throw new TranscribeError("Transcription locale désactivée (STT_PROVIDER=none).", "NOT_CONFIGURED");
  const rate = TRANSCRIBE_SAMPLE_RATE;
  const block = 120 * rate;
  const out: TimedText[] = [];
  const [asr, convert] = await Promise.all([loadModel(), loadConverter()]).catch((err) => {
    throw new TranscribeError(`Moteur Whisper indisponible (${err instanceof Error ? err.message.slice(0, 160) : "chargement"}).`, "ENGINE_ERROR");
  });
  let start = 0;
  while (start < samples.length) {
    let end = Math.min(samples.length, start + block);
    if (end < samples.length) end = quietestCut(samples, end - 10 * rate, Math.min(samples.length, end + 10 * rate));
    const chunk = samples.subarray(start, end);
    if (chunk.length >= rate * 0.5) {
      let res: { text: string; chunks?: { timestamp: [number, number | null]; text: string }[] };
      try {
        const r = await asr(chunk, { language: "chinese", task: "transcribe", chunk_length_s: 30, stride_length_s: 5, return_timestamps: true });
        res = (Array.isArray(r) ? r[0] : r) as typeof res;
      } catch (err) {
        throw new TranscribeError(`Transcription impossible (${err instanceof Error ? err.message.slice(0, 160) : "moteur"}).`, "ENGINE_ERROR");
      }
      const offset = start / rate;
      const blockEnd = end / rate;
      for (const c of res.chunks ?? [{ timestamp: [0, chunk.length / rate] as [number, number], text: res.text }]) {
        const t = collapseRepeats(normalizeTranscript(c.text ?? "", convert));
        if (!t) continue;
        const s = offset + (c.timestamp[0] ?? 0);
        const e = Math.min(blockEnd, offset + (c.timestamp[1] ?? chunk.length / rate));
        // Whisper répète parfois la même phrase en boucle sur un passage musical : on n'en garde qu'une.
        if (out.length && out[out.length - 1].t === t) continue;
        out.push({ s, e: Math.max(e, s), t });
      }
    }
    start = end;
    onProgress?.(Math.min(1, start / samples.length));
  }
  return out;
}
