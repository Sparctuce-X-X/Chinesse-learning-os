"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { FileText, FileUp, Loader2, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { cn } from "@/lib/utils";

const MAX_BYTES = 40 * 1024 * 1024;

export function PdfDropzone({ aiAvailable, aiReason }: { aiAvailable: boolean; aiReason: string | null }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [stage, setStage] = useState<"idle" | "uploading" | "reading">("idle");

  const pick = (f: File | undefined | null) => {
    setError(null);
    if (!f) return;
    if (!/\.pdf$/i.test(f.name) && f.type !== "application/pdf") {
      setError("Ce fichier n'est pas un PDF.");
      return;
    }
    if (f.size > MAX_BYTES) {
      setError("Le fichier dépasse 40 Mo.");
      return;
    }
    setFile(f);
  };

  useEffect(() => {
    // Fichier choisi avant le chargement complet de la page (connexion lente) :
    // l'événement « change » a été perdu, mais le fichier est toujours dans le champ.
    const early = inputRef.current?.files?.[0];
    if (early) pick(early);
  }, []);

  const upload = async () => {
    if (!file) return;
    setStage("uploading");
    setError(null);
    const body = new FormData();
    body.append("file", file);
    try {
      const t = setTimeout(() => setStage("reading"), 600);
      const res = await fetch("/api/lessons/import", { method: "POST", body });
      clearTimeout(t);
      const data = (await res.json().catch(() => ({}))) as { lessonId?: string; error?: string; duplicateOf?: { title: string } | null };
      if (!res.ok || !data.lessonId) {
        setError(data.error ?? "L'import a échoué.");
        setStage("idle");
        return;
      }
      const q = data.duplicateOf ? `?doublon=${encodeURIComponent(data.duplicateOf.title)}` : "";
      router.push(`/cours/${data.lessonId}${q}`);
    } catch {
      setError("Impossible de joindre le serveur. Vérifie que l'application est lancée.");
      setStage("idle");
    }
  };

  const busy = stage !== "idle";

  return (
    <div className="space-y-4">
      {!aiAvailable && (
        <Alert>
          <TriangleAlert aria-hidden />
          <AlertTitle>IA indisponible : extraction simple</AlertTitle>
          <AlertDescription>
            {aiReason ?? "Aucun fournisseur IA configuré."} Les tableaux de vocabulaire et les notes seront extraits automatiquement, mais pas le contenu des pages images. Tu pourras compléter à la main.
          </AlertDescription>
        </Alert>
      )}

      <div
        role="button"
        tabIndex={0}
        aria-label="Déposer un PDF ou cliquer pour choisir un fichier"
        onClick={() => !busy && inputRef.current?.click()}
        onKeyDown={(e) => {
          if ((e.key === "Enter" || e.key === " ") && !busy) {
            e.preventDefault();
            inputRef.current?.click();
          }
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          if (!busy) pick(e.dataTransfer.files?.[0]);
        }}
        className={cn(
          "flex min-h-56 flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed bg-card px-6 py-10 text-center transition",
          "focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
          dragging ? "border-primary bg-accent/60" : "border-border hover:border-primary/50",
          busy && "pointer-events-none opacity-70",
        )}
      >
        <span className="flex size-12 items-center justify-center rounded-full bg-accent text-accent-foreground">
          {file ? <FileText className="size-6" aria-hidden /> : <FileUp className="size-6" aria-hidden />}
        </span>
        {file ? (
          <div>
            <p className="font-medium">{file.name}</p>
            <p className="text-sm text-muted-foreground">{(file.size / 1024 / 1024).toFixed(1)} Mo · cliquer pour changer</p>
          </div>
        ) : (
          <div>
            <p className="font-medium">Glisse ton PDF ici</p>
            <p className="text-sm text-muted-foreground">ou clique pour choisir un fichier (40 Mo max.)</p>
          </div>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="application/pdf,.pdf"
        className="sr-only"
        tabIndex={-1}
        aria-label="Choisir un fichier PDF"
        data-testid="pdf-input"
        onChange={(e) => pick(e.target.files?.[0])}
      />

      {error && (
        <Alert variant="destructive" role="alert">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Button size="lg" className="h-12 w-full text-base" disabled={!file || busy} onClick={upload}>
        {busy ? (
          <>
            <Loader2 className="animate-spin" aria-hidden />
            {stage === "uploading" ? "Téléchargement…" : "Lecture du PDF…"}
          </>
        ) : (
          "Importer et analyser"
        )}
      </Button>
      <p className="text-center text-xs text-muted-foreground">Le fichier d&apos;origine n&apos;est jamais modifié : l&apos;application travaille sur une copie.</p>
    </div>
  );
}
