import { NextResponse } from "next/server";
import { activeTtsProvider, getUserVoice, synthesize, TtsError } from "@/server/tts";
import { isVoiceOf } from "@/lib/audio/voices";
import { logError } from "@/lib/log";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/tts?text=…&speed=normal|slow[&voice=zh-CN-XiaoxiaoNeural]
 * Renvoie un MP3 (voix Edge ou Google selon TTS_PROVIDER). 501 si non configuré : le navigateur
 * utilise alors sa propre synthèse vocale.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const text = url.searchParams.get("text") ?? "";
  const speed = url.searchParams.get("speed") === "slow" ? "slow" : "normal";
  const voiceParam = url.searchParams.get("voice");
  try {
    const provider = activeTtsProvider();
    const voice = provider && isVoiceOf(provider, voiceParam) ? voiceParam : ((await getUserVoice()) ?? undefined);
    const audio = await synthesize(text, { voice, speed });
    return new Response(new Uint8Array(audio), {
      headers: {
        "Content-Type": "audio/mpeg",
        "Content-Length": String(audio.byteLength),
        // Le même texte avec la même voix donne toujours le même fichier.
        "Cache-Control": "private, max-age=31536000, immutable",
      },
    });
  } catch (err) {
    if (err instanceof TtsError) {
      const status = err.code === "NOT_CONFIGURED" ? 501 : err.code === "INVALID_TEXT" ? 400 : err.code === "QUOTA" ? 429 : 502;
      if (status >= 500 && status !== 501) logError("api:tts", err);
      return NextResponse.json({ error: err.message, code: err.code }, { status });
    }
    logError("api:tts", err);
    return NextResponse.json({ error: "Échec de la synthèse vocale." }, { status: 500 });
  }
}
