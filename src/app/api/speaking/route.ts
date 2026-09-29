import { NextResponse } from "next/server";
import { z } from "zod";
import { submitSpeaking } from "@/server/speaking";
import { saveFile } from "@/server/storage";
import { logError } from "@/lib/log";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_AUDIO_BYTES = 10 * 1024 * 1024;

const FieldsSchema = z.object({
  prompt: z.string().min(1).max(500),
  questionHanzi: z.string().max(500).optional().nullable(),
  instructionFr: z.string().max(500),
  targetIds: z.string().transform((s) => s.split(",").filter(Boolean)),
  transcription: z.string().min(1).max(1000),
  inputMode: z.enum(["VOICE", "TEXT"]),
  durationSeconds: z.coerce.number().int().min(0).max(600).optional().nullable(),
});

export async function POST(request: Request) {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  }
  const parsed = FieldsSchema.safeParse({
    prompt: form.get("prompt"),
    questionHanzi: form.get("questionHanzi") || null,
    instructionFr: form.get("instructionFr") ?? "",
    targetIds: form.get("targetIds") ?? "",
    transcription: form.get("transcription"),
    inputMode: form.get("inputMode"),
    durationSeconds: form.get("durationSeconds") || null,
  });
  if (!parsed.success) return NextResponse.json({ error: "Réponse vide ou invalide." }, { status: 400 });

  let audioPath: string | null = null;
  const audio = form.get("audio");
  if (audio instanceof File && audio.size > 0) {
    if (audio.size > MAX_AUDIO_BYTES) return NextResponse.json({ error: "Enregistrement trop long." }, { status: 413 });
    const ext = audio.type.includes("mp4") ? "m4a" : audio.type.includes("ogg") ? "ogg" : "webm";
    audioPath = await saveFile("audio", `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`, new Uint8Array(await audio.arrayBuffer()));
  }
  try {
    const result = await submitSpeaking({ ...parsed.data, questionHanzi: parsed.data.questionHanzi ?? null, durationSeconds: parsed.data.durationSeconds ?? null, audioPath });
    return NextResponse.json(result);
  } catch (err) {
    logError("api:speaking", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Échec de l'enregistrement." }, { status: 500 });
  }
}
