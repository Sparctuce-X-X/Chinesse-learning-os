import { NextResponse } from "next/server";
import { importPdf, LessonError, MAX_PDF_BYTES } from "@/server/lessons";
import { logError } from "@/lib/log";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  }
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "Aucun fichier reçu." }, { status: 400 });
  if (file.size > MAX_PDF_BYTES) return NextResponse.json({ error: "Le fichier dépasse 40 Mo." }, { status: 413 });
  const isPdfName = /\.pdf$/i.test(file.name);
  if (!isPdfName && file.type !== "application/pdf") {
    return NextResponse.json({ error: "Seuls les fichiers PDF sont acceptés." }, { status: 415 });
  }
  try {
    const data = new Uint8Array(await file.arrayBuffer());
    const result = await importPdf(file.name, data);
    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    if (err instanceof LessonError) return NextResponse.json({ error: err.message }, { status: 400 });
    logError("api:import", err);
    return NextResponse.json({ error: "L'import a échoué." }, { status: 500 });
  }
}
