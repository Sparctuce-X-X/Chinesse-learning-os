import { getAIStatus } from "@/lib/ai";
import { PageHeader } from "@/components/page";
import { PdfDropzone } from "@/features/lessons/pdf-dropzone";

export const dynamic = "force-dynamic";
export const metadata = { title: "Importer un cours" };

export default async function ImportPage() {
  const ai = await getAIStatus();
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="Importer un cours" description="Dépose le PDF de ton cours. Tu pourras vérifier et corriger l'extraction avant de l'ajouter." />
      <PdfDropzone aiAvailable={ai.available} aiReason={ai.reason ?? null} />
    </div>
  );
}
