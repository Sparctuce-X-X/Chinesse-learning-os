"use client";

/**
 * Transcription côté client : décode l'enregistrement du micro (webm, mp4…), le convertit
 * en mono 16 kHz et l'envoie au serveur (Whisper local). Aucune dépendance externe.
 */

const SAMPLE_RATE = 16_000;

export function isLocalSttAvailable(): boolean {
  return typeof document !== "undefined" && document.body.dataset.sttLocal === "1";
}

async function toMono16k(blob: Blob): Promise<Float32Array> {
  const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctx) throw new Error("Décodage audio indisponible dans ce navigateur.");
  const ctx = new Ctx();
  let decoded: AudioBuffer;
  try {
    decoded = await ctx.decodeAudioData(await blob.arrayBuffer());
  } finally {
    void ctx.close();
  }
  const length = Math.max(1, Math.ceil(decoded.duration * SAMPLE_RATE));
  const offline = new OfflineAudioContext(1, length, SAMPLE_RATE);
  const src = offline.createBufferSource();
  src.buffer = decoded;
  src.connect(offline.destination);
  src.start();
  const rendered = await offline.startRendering();
  return rendered.getChannelData(0);
}

/** Renvoie la transcription chinoise de l'enregistrement, ou lève une erreur au message lisible. */
export async function transcribeRecording(blob: Blob): Promise<string> {
  let samples: Float32Array;
  try {
    samples = await toMono16k(blob);
  } catch {
    throw new Error("Impossible de lire l'enregistrement pour le transcrire. Tu peux taper ce que tu as dit.");
  }
  const body = new Uint8Array(samples.buffer, samples.byteOffset, samples.byteLength).slice();
  let res: Response;
  try {
    res = await fetch("/api/transcribe", { method: "POST", headers: { "Content-Type": "application/octet-stream" }, body });
  } catch {
    throw new Error("Le serveur de l'application ne répond pas. Tu peux taper ce que tu as dit.");
  }
  const data = (await res.json().catch(() => ({}))) as { text?: string; error?: string };
  if (!res.ok) throw new Error(`${data.error ?? "Transcription impossible."} Tu peux taper ce que tu as dit.`);
  return data.text ?? "";
}
