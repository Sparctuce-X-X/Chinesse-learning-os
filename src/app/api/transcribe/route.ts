import { NextResponse } from "next/server";
import { TRANSCRIBE_MAX_SECONDS, TRANSCRIBE_SAMPLE_RATE, transcribe, TranscribeError } from "@/server/transcribe";
import { logError } from "@/lib/log";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * POST /api/transcribe — corps : échantillons Float32 (little-endian), mono, 16 kHz.
 * Le navigateur décode et rééchantillonne l'enregistrement ; le serveur transcrit avec Whisper.
 */
export async function POST(request: Request) {
  const buf = await request.arrayBuffer();
  if (buf.byteLength === 0 || buf.byteLength % 4 !== 0 || buf.byteLength > TRANSCRIBE_SAMPLE_RATE * TRANSCRIBE_MAX_SECONDS * 4) {
    return NextResponse.json({ error: "Audio invalide." }, { status: 400 });
  }
  try {
    const text = await transcribe(new Float32Array(buf));
    return NextResponse.json({ text });
  } catch (err) {
    if (err instanceof TranscribeError) {
      const status = err.code === "NOT_CONFIGURED" ? 501 : err.code === "INVALID_AUDIO" ? 400 : 500;
      if (status === 500) logError("api:transcribe", err);
      return NextResponse.json({ error: err.message }, { status });
    }
    logError("api:transcribe", err);
    return NextResponse.json({ error: "Transcription impossible." }, { status: 500 });
  }
}
