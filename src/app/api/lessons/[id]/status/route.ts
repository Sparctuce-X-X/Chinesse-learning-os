import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { isAnalysisRunning, recoverStaleAnalyses } from "@/server/lessons";
import { transcriptionProgress } from "@/server/resources";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: RouteContext<"/api/lessons/[id]/status">) {
  const { id } = await ctx.params;
  await recoverStaleAnalyses();
  const lesson = await prisma.lesson.findUnique({
    where: { id },
    select: {
      processingStatus: true,
      analysisError: true,
      updatedAt: true,
      documents: { select: { pageCount: true, imagePages: true, processingStatus: true } },
    },
  });
  if (!lesson) return NextResponse.json({ error: "Cours introuvable." }, { status: 404 });
  const doc = lesson.documents[0];
  return NextResponse.json({
    status: lesson.processingStatus,
    error: lesson.analysisError,
    running: isAnalysisRunning(id),
    /** Vidéo transcrite par Whisper : progression de 0 à 1. */
    transcription: transcriptionProgress(id),
    pageCount: doc?.pageCount ?? 0,
    imagePages: (doc?.imagePages as number[] | null) ?? [],
    updatedAt: lesson.updatedAt,
  });
}
