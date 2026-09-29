import "server-only";
import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { MsEdgeTTS, OUTPUT_FORMAT } from "msedge-tts";
import { prisma } from "@/lib/db/prisma";
import { logError } from "@/lib/log";
import { defaultVoice, isVoiceOf, TTS_MAX_CHARS, type TtsProvider, type TtsSpeed } from "@/lib/audio/voices";
import { dataDir } from "./storage";
import { getUser } from "./user";

/**
 * Synthèse vocale côté serveur, avec cache disque (DATA_DIR/tts/) :
 * chaque texte n'est généré qu'une fois, puis servi instantanément (et hors ligne).
 *
 * Fournisseurs (TTS_PROVIDER) :
 *  - edge (défaut) : voix neuronales Microsoft via le service de lecture à voix haute d'Edge.
 *    Gratuit et sans compte, mais non officiel : il peut cesser de fonctionner sans préavis.
 *  - google : Google Cloud Text-to-Speech (Chirp 3 HD), clé GOOGLE_TTS_API_KEY.
 *  - none : pas de synthèse serveur (le navigateur utilise sa propre voix).
 */

export class TtsError extends Error {
  constructor(
    message: string,
    public readonly code: "NOT_CONFIGURED" | "INVALID_TEXT" | "PROVIDER_ERROR" | "QUOTA",
  ) {
    super(message);
    this.name = "TtsError";
  }
}

/** Fournisseur actif, ou null si la synthèse serveur est désactivée / non configurée. */
export function activeTtsProvider(): TtsProvider | null {
  const choice = (process.env.TTS_PROVIDER || "edge").toLowerCase();
  if (choice === "none") return null;
  if (choice === "google") return process.env.GOOGLE_TTS_API_KEY ? "google" : null;
  return "edge";
}

export function isCloudTtsConfigured(): boolean {
  return activeTtsProvider() !== null;
}

export function normalizeTtsText(raw: string): string {
  return raw.normalize("NFC").replace(/\s+/g, " ").trim();
}

function cachePath(provider: TtsProvider, voice: string, speed: TtsSpeed, text: string): string {
  const hash = createHash("sha256").update(`${provider}|${voice}|${speed}|${text}`).digest("hex");
  return join(dataDir(), "tts", hash.slice(0, 2), `${hash}.mp3`);
}

// ─── Fournisseurs ─────────────────────────────────────────────────────────────

const RATE: Record<TtsSpeed, number> = { normal: 0.95, slow: 0.7 };

function escapeXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

async function edgeSynthesize(text: string, voice: string, speed: TtsSpeed): Promise<Buffer> {
  const tts = new MsEdgeTTS();
  try {
    await tts.setMetadata(voice, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);
    const { audioStream } = tts.toStream(escapeXml(text), { rate: RATE[speed] });
    return await new Promise<Buffer>((resolve, reject) => {
      const chunks: Buffer[] = [];
      const timer = setTimeout(() => reject(new TtsError("Le service vocal Edge ne répond pas.", "PROVIDER_ERROR")), 20_000);
      audioStream.on("data", (c: Buffer) => chunks.push(c));
      audioStream.on("error", (e: Error) => {
        clearTimeout(timer);
        reject(new TtsError(`Service vocal Edge : ${e.message}`, "PROVIDER_ERROR"));
      });
      audioStream.on("close", () => {
        clearTimeout(timer);
        const audio = Buffer.concat(chunks);
        if (audio.length === 0) reject(new TtsError("Le service vocal Edge a renvoyé un audio vide.", "PROVIDER_ERROR"));
        else resolve(audio);
      });
    });
  } catch (err) {
    if (err instanceof TtsError) throw err;
    throw new TtsError(`Service vocal Edge injoignable (${err instanceof Error ? err.message : "réseau"}).`, "PROVIDER_ERROR");
  } finally {
    try {
      tts.close();
    } catch {
      // déjà fermé
    }
  }
}

async function googleSynthesize(text: string, voice: string, speed: TtsSpeed): Promise<Buffer> {
  const key = process.env.GOOGLE_TTS_API_KEY;
  if (!key) throw new TtsError("GOOGLE_TTS_API_KEY n'est pas définie.", "NOT_CONFIGURED");
  let res: Response;
  try {
    res = await fetch("https://texttospeech.googleapis.com/v1/text:synthesize", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Goog-Api-Key": key },
      body: JSON.stringify({
        input: { text },
        voice: { languageCode: "cmn-CN", name: `cmn-CN-Chirp3-HD-${voice}` },
        audioConfig: { audioEncoding: "MP3", speakingRate: RATE[speed] },
      }),
      signal: AbortSignal.timeout(20_000),
    });
  } catch (err) {
    throw new TtsError(`Service vocal injoignable (${err instanceof Error ? err.name : "réseau"}).`, "PROVIDER_ERROR");
  }
  if (!res.ok) {
    // Le corps d'erreur Google ne contient pas la clé ; on n'en garde qu'un extrait.
    const detail = (await res.text().catch(() => "")).slice(0, 200);
    if (res.status === 429) throw new TtsError("Quota Google Text-to-Speech atteint.", "QUOTA");
    throw new TtsError(`Google Text-to-Speech a répondu ${res.status}. ${detail}`, "PROVIDER_ERROR");
  }
  const data = (await res.json()) as { audioContent?: string };
  if (!data.audioContent) throw new TtsError("Réponse audio vide.", "PROVIDER_ERROR");
  return Buffer.from(data.audioContent, "base64");
}

const PROVIDERS: Record<TtsProvider, (text: string, voice: string, speed: TtsSpeed) => Promise<Buffer>> = {
  edge: edgeSynthesize,
  google: googleSynthesize,
};

// ─── Synthèse avec cache ──────────────────────────────────────────────────────

const inflight = globalThis as unknown as { __tts?: Map<string, Promise<Buffer>> };
function inflightMap() {
  if (!inflight.__tts) inflight.__tts = new Map();
  return inflight.__tts;
}

/** Renvoie le MP3 (depuis le cache disque, sinon généré puis mis en cache). */
export async function synthesize(rawText: string, opts: { voice?: string; speed?: TtsSpeed } = {}): Promise<Buffer> {
  const text = normalizeTtsText(rawText);
  if (!text) throw new TtsError("Texte vide.", "INVALID_TEXT");
  if (text.length > TTS_MAX_CHARS) throw new TtsError("Texte trop long pour la synthèse vocale.", "INVALID_TEXT");
  const provider = activeTtsProvider();
  if (!provider) throw new TtsError("Synthèse vocale serveur non configurée.", "NOT_CONFIGURED");
  const voice = isVoiceOf(provider, opts.voice) ? opts.voice : defaultVoice(provider);
  const speed = opts.speed ?? "normal";
  const path = cachePath(provider, voice, speed, text);

  try {
    return await readFile(path);
  } catch {
    // pas encore en cache
  }

  const map = inflightMap();
  const pending = map.get(path);
  if (pending) return pending;
  const job = (async () => {
    const audio = await PROVIDERS[provider](text, voice, speed);
    await mkdir(join(path, ".."), { recursive: true });
    // Écriture atomique : jamais de fichier MP3 à moitié écrit dans le cache.
    const tmp = `${path}.${process.pid}.${Date.now()}.tmp`;
    await writeFile(tmp, audio);
    await rename(tmp, path);
    return audio;
  })().finally(() => map.delete(path));
  map.set(path, job);
  return job;
}

/** Voix choisie par l'utilisateur pour le fournisseur actif (ou la voix par défaut). */
export async function getUserVoice(): Promise<string | null> {
  const provider = activeTtsProvider();
  if (!provider) return null;
  const user = await getUser();
  return isVoiceOf(provider, user.ttsVoice) ? user.ttsVoice : defaultVoice(provider);
}

/**
 * Pré-génère l'audio des connaissances d'un cours (vocabulaire, phrases, exemples)
 * pour qu'il soit instantané et disponible hors ligne. Silencieux en cas d'échec.
 */
export async function pregenerateLessonAudio(lessonId: string): Promise<{ generated: number; failed: number }> {
  if (!activeTtsProvider()) return { generated: 0, failed: 0 };
  const voice = (await getUserVoice()) ?? undefined;
  const links = await prisma.lessonKnowledge.findMany({
    where: { lessonId },
    include: { knowledgeItem: { include: { vocabulary: true, sentence: true, examples: { select: { hanzi: true } } } } },
  });
  const texts = new Set<string>();
  for (const l of links) {
    const k = l.knowledgeItem;
    if (k.vocabulary?.hanzi) texts.add(k.vocabulary.hanzi);
    if (k.sentence?.hanzi) texts.add(k.sentence.hanzi);
    for (const e of k.examples) texts.add(e.hanzi);
  }
  let generated = 0;
  let failed = 0;
  const queue = [...texts].filter((t) => normalizeTtsText(t).length <= TTS_MAX_CHARS);
  const worker = async () => {
    for (let t = queue.shift(); t !== undefined; t = queue.shift()) {
      try {
        await synthesize(t, { voice });
        generated++;
      } catch (err) {
        failed++;
        if (err instanceof TtsError && (err.code === "QUOTA" || err.code === "NOT_CONFIGURED")) {
          logError("tts:pregenerate", err, { lessonId });
          queue.length = 0;
        }
      }
    }
  };
  // Parallélisme modéré pour ne pas surcharger le service.
  await Promise.all([worker(), worker()]);
  return { generated, failed };
}
