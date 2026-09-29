"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CircleX, RefreshCw, Trash2, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { discardImportAction, reanalyzeLessonAction } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export function FailedImport({
  lessonId,
  error,
  canRetryExtraction,
  aiAvailable,
  resource = false,
}: {
  lessonId: string;
  error: string | null;
  canRetryExtraction: boolean;
  aiAvailable: boolean;
  /** Ressource externe (texte importé) plutôt qu'un cours en PDF. */
  resource?: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);

  const retry = (mode: "auto" | "heuristic") =>
    start(async () => {
      const res = await reanalyzeLessonAction(lessonId, mode);
      if (!res.ok) toast.error(res.error);
      router.refresh();
    });

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <Alert variant="destructive">
        <CircleX aria-hidden />
        <AlertTitle>{resource ? "L'analyse de cette ressource a échoué" : "Le traitement de ce cours a échoué"}</AlertTitle>
        <AlertDescription>
          {error ?? "Erreur inconnue."} {resource ? "Le texte importé est conservé." : "Le PDF importé est conservé."}
        </AlertDescription>
      </Alert>
      <div className="flex flex-wrap gap-2">
        {canRetryExtraction && (
          <>
            <Button onClick={() => retry("auto")} disabled={pending || !aiAvailable}>
              <RefreshCw /> Relancer l&apos;analyse IA
            </Button>
            <Button variant="outline" onClick={() => retry("heuristic")} disabled={pending}>
              <Wand2 /> {resource ? "Sans IA (dictionnaire HSK)" : "Extraction simple (sans IA)"}
            </Button>
          </>
        )}
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button variant="ghost" className="text-destructive" disabled={pending}>
              <Trash2 /> Abandonner cet import
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Abandonner cet import ?</DialogTitle>
              <DialogDescription>
                {resource
                  ? "La ressource et son texte importé seront supprimés. Tes connaissances ne sont pas touchées."
                  : "Le cours non validé et sa copie interne du PDF seront supprimés. Ton fichier d'origine n'est pas touché."}
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <DialogClose asChild>
                <Button variant="outline">Annuler</Button>
              </DialogClose>
              <Button
                variant="destructive"
                onClick={() =>
                  start(async () => {
                    const res = await discardImportAction(lessonId);
                    if (!res.ok) {
                      toast.error(res.error);
                      return;
                    }
                    router.push(resource ? "/ressources" : "/cours");
                  })
                }
              >
                Abandonner
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
      {!aiAvailable && canRetryExtraction && <p className="text-xs text-muted-foreground">L&apos;IA n&apos;est pas disponible : configure-la dans les paramètres pour relancer une analyse complète.</p>}
    </div>
  );
}
