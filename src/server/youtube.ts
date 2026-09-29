import "server-only";
import { execFile, spawn } from "node:child_process";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseJson3, type Segment } from "@/lib/resources/video";
import { ResourceError } from "./resource-sources";

/**
 * Vidéos YouTube : titre, durée et sous-titres chinois (API publique du lecteur YouTube, sans clé),
 * avec repli sur yt-dlp s'il est installé. Pour une vidéo sans sous-titres, yt-dlp et ffmpeg
 * récupèrent l'audio, transcrit ensuite localement par Whisper.
 *
 * YTDLP_PATH (défaut « yt-dlp ») et FFMPEG_PATH (défaut « ffmpeg ») : programmes à utiliser.
 */

export interface CaptionTrack {
  languageCode: string;
  /** Sous-titres automatiques de YouTube (reconnaissance vocale). */
  auto: boolean;
  url: string;
}

export interface VideoInfo {
  id: string;
  title: string | null;
  author: string | null;
  durationSec: number | null;
  tracks: CaptionTrack[];
}

// Client « Android » du lecteur : il renvoie les pistes de sous-titres sans jeton de page.
const ANDROID = {
  clientName: "ANDROID",
  clientVersion: "20.10.38",
  androidSdkVersion: 34,
  hl: "zh-CN",
};
const ANDROID_UA = `com.google.android.youtube/${ANDROID.clientVersion} (Linux; U; Android 14)`;

interface PlayerResponse {
  playabilityStatus?: { status?: string; reason?: string };
  videoDetails?: { title?: string; author?: string; lengthSeconds?: string };
  captions?: {
    playerCaptionsTracklistRenderer?: {
      captionTracks?: {
        baseUrl: string;
        languageCode: string;
        kind?: string;
      }[];
    };
  };
}

async function playerInfo(id: string): Promise<VideoInfo> {
  const res = await fetch("https://www.youtube.com/youtubei/v1/player?prettyPrint=false", {
    method: "POST",
    headers: { "Content-Type": "application/json", "User-Agent": ANDROID_UA },
    body: JSON.stringify({ context: { client: ANDROID }, videoId: id }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`lecteur YouTube : HTTP ${res.status}`);
  const j = (await res.json()) as PlayerResponse;
  const status = j.playabilityStatus?.status;
  if (status && status !== "OK") {
    if (status === "LOGIN_REQUIRED" || status === "UNPLAYABLE" || status === "ERROR") {
      throw new ResourceError(`Cette vidéo n'est pas accessible (${j.playabilityStatus?.reason ?? "privée, supprimée ou réservée"}).`);
    }
    throw new Error(`lecteur YouTube : ${status}`);
  }
  const tracks = (j.captions?.playerCaptionsTracklistRenderer?.captionTracks ?? []).map((t) => ({
    languageCode: t.languageCode,
    auto: t.kind === "asr",
    url: t.baseUrl.replace(/&fmt=[^&]*/g, "") + "&fmt=json3",
  }));
  const len = Number(j.videoDetails?.lengthSeconds);
  return {
    id,
    title: j.videoDetails?.title?.trim() || null,
    author: j.videoDetails?.author?.trim() || null,
    durationSec: Number.isFinite(len) && len > 0 ? len : null,
    tracks,
  };
}

// ─── Programmes externes (facultatifs) ────────────────────────────────────────

const ytDlp = () => process.env.YTDLP_PATH || "yt-dlp";
const ffmpeg = () => process.env.FFMPEG_PATH || "ffmpeg";

function run(cmd: string, args: string[], timeoutMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(/*turbopackIgnore: true*/ cmd, args, { timeout: timeoutMs, maxBuffer: 64 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) reject(Object.assign(err, { stderr: String(stderr).slice(-400) }));
      else resolve(String(stdout));
    });
  });
}

const available = new Map<string, Promise<boolean>>();
function hasProgram(cmd: string, versionArg: string): Promise<boolean> {
  if (!available.has(cmd)) {
    available.set(
      cmd,
      run(cmd, [versionArg], 15_000).then(
        () => true,
        () => false,
      ),
    );
  }
  return available.get(cmd)!;
}

export async function transcriptionToolsStatus(): Promise<{
  ytDlp: boolean;
  ffmpeg: boolean;
}> {
  const [a, b] = await Promise.all([hasProgram(ytDlp(), "--version"), hasProgram(ffmpeg(), "-version")]);
  return { ytDlp: a, ffmpeg: b };
}

// yt-dlp a besoin d'un moteur JavaScript pour YouTube : Node, déjà présent puisqu'il fait tourner l'application.
const YTDLP_BASE = ["--no-playlist", "--no-warnings", "--js-runtimes", "node"];

interface YtDlpInfo {
  title?: string;
  uploader?: string;
  channel?: string;
  duration?: number;
  subtitles?: Record<string, { ext: string; url: string }[]>;
  automatic_captions?: Record<string, { ext: string; url: string }[]>;
}

async function ytDlpInfo(id: string): Promise<VideoInfo> {
  const out = await run(ytDlp(), [...YTDLP_BASE, "-J", "--skip-download", `https://www.youtube.com/watch?v=${id}`], 60_000);
  const j = JSON.parse(out) as YtDlpInfo;
  const tracks: CaptionTrack[] = [];
  const add = (map: YtDlpInfo["subtitles"], auto: boolean) => {
    for (const [lang, formats] of Object.entries(map ?? {})) {
      // Sous-titres automatiques : seule la langue d'origine (« -orig ») est une vraie transcription, pas une traduction.
      if (auto && !lang.endsWith("-orig")) continue;
      const f = formats.find((x) => x.ext === "json3");
      if (f)
        tracks.push({
          languageCode: lang.replace(/-orig$/, ""),
          auto,
          url: f.url,
        });
    }
  };
  add(j.subtitles, false);
  add(j.automatic_captions, true);
  return {
    id,
    title: j.title?.trim() || null,
    author: (j.channel || j.uploader)?.trim() || null,
    durationSec: j.duration ? Math.round(j.duration) : null,
    tracks,
  };
}

/** Informations de la vidéo (API du lecteur, puis yt-dlp en secours). */
export async function fetchVideoInfo(id: string): Promise<VideoInfo> {
  try {
    return await playerInfo(id);
  } catch (err) {
    if (err instanceof ResourceError) throw err;
    if (await hasProgram(ytDlp(), "--version")) {
      try {
        return await ytDlpInfo(id);
      } catch {
        // on signale l'erreur d'origine ci-dessous
      }
    }
    throw new ResourceError("Impossible de lire les informations de cette vidéo YouTube. Réessaie plus tard, ou importe ses sous-titres (.srt, .vtt).");
  }
}

// ─── Sous-titres ──────────────────────────────────────────────────────────────

const SIMPLIFIED = /^zh(-(Hans|CN|SG))?$/i;
const TRADITIONAL = /^zh-(Hant|TW|HK|MO)$/i;

/** Meilleure piste chinoise : sous-titres de l'auteur (simplifiés, puis traditionnels), puis automatiques. */
export function pickChineseTrack(tracks: CaptionTrack[]): CaptionTrack | null {
  const rank = (t: CaptionTrack) =>
    (SIMPLIFIED.test(t.languageCode) ? 0 : TRADITIONAL.test(t.languageCode) ? 1 : /^zh/i.test(t.languageCode) ? 2 : 9) + (t.auto ? 10 : 0);
  const zh = tracks.filter((t) => rank(t) % 10 < 9).sort((a, b) => rank(a) - rank(b));
  return zh[0] ?? null;
}

export async function fetchCaptions(track: CaptionTrack): Promise<Segment[]> {
  const res = await fetch(track.url, {
    headers: { "User-Agent": ANDROID_UA },
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new ResourceError(`Les sous-titres n'ont pas pu être téléchargés (erreur ${res.status}).`);
  let data: unknown;
  try {
    data = await res.json();
  } catch {
    throw new ResourceError("Les sous-titres de cette vidéo sont illisibles.");
  }
  return parseJson3(data as Parameters<typeof parseJson3>[0]);
}

// ─── Audio (pour Whisper) ─────────────────────────────────────────────────────

export const AUDIO_SAMPLE_RATE = 16_000;

/**
 * Télécharge l'audio (yt-dlp) et le convertit en mono 16 kHz (ffmpeg), limité aux `maxSeconds`
 * premières secondes. Les fichiers temporaires sont supprimés dans tous les cas.
 */
export async function downloadAudio(id: string, maxSeconds: number): Promise<Float32Array> {
  const dir = await mkdtemp(join(tmpdir(), "clos-audio-"));
  try {
    try {
      await run(
        ytDlp(),
        [...YTDLP_BASE, "-q", "-f", "ba[abr<=96]/wa/ba", "-o", join(dir, "audio.%(ext)s"), `https://www.youtube.com/watch?v=${id}`],
        15 * 60_000,
      );
    } catch (err) {
      const detail = (err as { stderr?: string }).stderr?.trim().split("\n").pop() ?? "";
      throw new ResourceError(
        `Le téléchargement de l'audio a échoué${detail ? ` (${detail.slice(0, 160)})` : ""}. Mets yt-dlp à jour (brew upgrade yt-dlp) puis réessaie.`,
      );
    }
    const file = (await readdir(dir)).find((f) => f.startsWith("audio."));
    if (!file) throw new ResourceError("Le téléchargement de l'audio a échoué.");
    const raw = join(dir, "audio.f32");
    await new Promise<void>((resolve, reject) => {
      const p = spawn(/*turbopackIgnore: true*/ ffmpeg(), [
        "-loglevel",
        "error",
        "-y",
        "-i",
        join(dir, file),
        "-t",
        String(maxSeconds),
        "-ac",
        "1",
        "-ar",
        String(AUDIO_SAMPLE_RATE),
        "-f",
        "f32le",
        raw,
      ]);
      p.on("error", reject);
      p.on("close", (code) => (code === 0 ? resolve() : reject(new ResourceError("La conversion de l'audio (ffmpeg) a échoué."))));
    });
    const read = await readFile(raw);
    const buf = read.byteOffset % 4 ? new Uint8Array(read) : read;
    return new Float32Array(buf.buffer, buf.byteOffset, Math.floor(buf.byteLength / 4));
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
}
