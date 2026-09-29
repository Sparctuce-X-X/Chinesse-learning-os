import { readFile } from "node:fs/promises";
import { prisma } from "@/lib/db/prisma";
import { absoluteStoragePath } from "@/server/storage";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Réécoute d'un enregistrement oral. */
export async function GET(_req: Request, ctx: RouteContext<"/api/audio/[id]">) {
  const { id } = await ctx.params;
  const attempt = await prisma.speakingAttempt.findUnique({ where: { id }, select: { audioPath: true } });
  if (!attempt?.audioPath || !attempt.audioPath.startsWith("audio/")) return new Response("Introuvable.", { status: 404 });
  try {
    const data = await readFile(absoluteStoragePath(attempt.audioPath));
    const type = attempt.audioPath.endsWith(".m4a") ? "audio/mp4" : attempt.audioPath.endsWith(".ogg") ? "audio/ogg" : "audio/webm";
    return new Response(new Uint8Array(data), { headers: { "Content-Type": type, "Cache-Control": "private, max-age=86400" } });
  } catch {
    return new Response("Fichier audio manquant.", { status: 404 });
  }
}
