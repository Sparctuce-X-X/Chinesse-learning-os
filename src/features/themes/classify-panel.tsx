"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { classifyThemesAction } from "@/app/actions";
import { Button } from "@/components/ui/button";

interface Status {
  running: boolean;
  lastError: string | null;
  unclassified: number;
  lastClassified: number;
}

/**
 * Rangement automatique : affiche les éléments en attente, lance le rangement et suit
 * son avancement (il tourne en arrière-plan sur le serveur, y compris après un import).
 */
export function ClassifyPanel({ initial, aiAvailable, aiReason }: { initial: Status; aiAvailable: boolean; aiReason?: string }) {
  const router = useRouter();
  const [status, setStatus] = useState(initial);
  const [pending, start] = useTransition();
  const wasRunning = useRef(initial.running);

  const poll = useCallback(async () => {
    try {
      const res = await fetch("/api/themes/status", { cache: "no-store" });
      if (!res.ok) return;
      const next = (await res.json()) as Status;
      setStatus(next);
      if (wasRunning.current && !next.running) {
        if (next.lastError) toast.error(next.lastError);
        else toast.success("Tes mots sont rangés par thème.");
        router.refresh();
      }
      wasRunning.current = next.running;
    } catch {
      // serveur momentanément indisponible : nouvelle tentative au prochain tour
    }
  }, [router]);

  useEffect(() => {
    if (!status.running) return;
    const t = setInterval(poll, 2500);
    return () => clearInterval(t);
  }, [status.running, poll]);

  const run = () =>
    start(async () => {
      const res = await classifyThemesAction();
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      wasRunning.current = true;
      setStatus((s) => ({ ...s, running: true }));
    });

  if (status.running) {
    return (
      <div role="status" className="mb-6 flex items-center gap-3 rounded-xl border bg-card p-4 text-sm">
        <Loader2 className="size-5 shrink-0 animate-spin text-primary" aria-hidden />
        <div>
          <p className="font-medium">Rangement en cours…</p>
          <p className="text-muted-foreground">
            L&apos;IA range {status.unclassified} élément{status.unclassified > 1 ? "s" : ""} par thème (environ 1 minute). Tu peux quitter la page.
          </p>
        </div>
      </div>
    );
  }
  if (status.unclassified === 0 && !status.lastError) return null;
  return (
    <div className="mb-6 flex flex-col gap-3 rounded-xl border bg-card p-4 text-sm sm:flex-row sm:items-center sm:justify-between">
      <div>
        {status.unclassified > 0 && (
          <p className="font-medium">
            {status.unclassified} élément{status.unclassified > 1 ? "s" : ""} pas encore rangé{status.unclassified > 1 ? "s" : ""}
          </p>
        )}
        {status.lastError ? (
          <p role="alert" className="text-destructive">
            {status.lastError}
          </p>
        ) : aiAvailable ? (
          <p className="text-muted-foreground">Les nouveaux mots sont rangés automatiquement après chaque cours validé.</p>
        ) : (
          <p className="text-muted-foreground">
            Le rangement automatique nécessite l&apos;IA ({aiReason ?? "indisponible"}). Tu peux ranger tes mots à la main depuis leur fiche.
          </p>
        )}
      </div>
      {aiAvailable && status.unclassified > 0 && (
        <Button onClick={run} disabled={pending} className="shrink-0">
          {pending ? <Loader2 className="animate-spin" /> : <Sparkles />} Ranger maintenant
        </Button>
      )}
    </div>
  );
}
