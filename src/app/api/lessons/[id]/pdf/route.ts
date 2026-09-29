import { readLessonPdf } from "@/server/lessons";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Sert la copie interne du PDF (jamais l'original de source-materials/). */
export async function GET(_req: Request, ctx: RouteContext<"/api/lessons/[id]/pdf">) {
  const { id } = await ctx.params;
  const pdf = await readLessonPdf(id);
  if (!pdf) return new Response("PDF introuvable.", { status: 404 });
  return new Response(new Uint8Array(pdf.data), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(pdf.filename)}`,
      "Cache-Control": "private, max-age=3600",
    },
  });
}
