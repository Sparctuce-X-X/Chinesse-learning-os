import { NextResponse } from "next/server";
import { createResource, ResourceError } from "@/server/resources";
import { RESOURCE_MAX_BYTES } from "@/server/resource-sources";
import { logError } from "@/lib/log";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Import d'une ressource externe (FormData : kind = TEXT | ARTICLE | DOCUMENT | VIDEO, text, title, url, file). */
export async function POST(request: Request) {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  }
  const kind = form.get("kind")?.toString();
  try {
    let result;
    if (kind === "TEXT") {
      result = await createResource({ kind: "TEXT", text: form.get("text")?.toString() ?? "", title: form.get("title")?.toString() || null });
    } else if (kind === "ARTICLE") {
      result = await createResource({ kind: "ARTICLE", url: form.get("url")?.toString() ?? "" });
    } else if (kind === "VIDEO") {
      result = await createResource({ kind: "VIDEO", url: form.get("url")?.toString() ?? "" });
    } else if (kind === "DOCUMENT") {
      const file = form.get("file");
      if (!(file instanceof File) || file.size === 0) return NextResponse.json({ error: "Choisis un fichier." }, { status: 400 });
      if (file.size > RESOURCE_MAX_BYTES) return NextResponse.json({ error: "Le fichier dépasse 20 Mo." }, { status: 413 });
      result = await createResource({ kind: "DOCUMENT", filename: file.name, data: new Uint8Array(await file.arrayBuffer()) });
    } else {
      return NextResponse.json({ error: "Type de ressource inconnu." }, { status: 400 });
    }
    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    if (err instanceof ResourceError) return NextResponse.json({ error: err.message }, { status: 400 });
    logError("api:resource-import", err);
    return NextResponse.json({ error: "L'import a échoué." }, { status: 500 });
  }
}
