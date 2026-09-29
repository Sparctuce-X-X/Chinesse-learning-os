"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface Status {
  status: string;
  error: string | null;
  running: boolean;
  pageCount: number;
  imagePages: number[];
}

/**
 * Suivi de l'analyse : étapes réelles (lecture du PDF, analyse, préparation),
 * temps écoulé et informations concrètes — jamais un spinner sans contexte.
 */
export function AnalysisProgress({ lessonId, aiLabel, startedAt }: { lessonId: string; aiLabel: string | null; startedAt: string }) {
  const router = useRouter();
  const [status, setStatus] = useState<Status | null>(null);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    let stop = false;
    const poll = async () => {
      try {
        const res = await fetch(`/api/lessons/${lessonId}/status`, { cache: "no-store" });
        if (res.ok) {
          const s = (await res.json()) as Status;
          if (stop) return;
          setStatus(s);
          if (s.status !== "ANALYZING" && s.status !== "EXTRACTING" && s.status !== "UPLOADED") {
            router.refresh();
            return;
          }
        }
      } catch {
        // réseau indisponible : on réessaie au prochain tour
      }
      if (!stop) setTimeout(poll, 2500);
    };
    void poll();
    return () => {
      stop = true;
    };
  }, [lessonId, router]);

  useEffect(() => {
    const t0 = new Date(startedAt).getTime();
    const tick = () => setElapsed(Math.max(0, Math.round((Date.now() - t0) / 1000)));
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [startedAt]);

  const extracted = !!status && status.status !== "EXTRACTING" && status.status !== "UPLOADED";
  const steps = [
    { label: "Téléchargement", done: true },
    {
      label: "Lecture du PDF",
      done: extracted,
      detail: extracted && status
        ? `${status.pageCount} pages${status.imagePages.length ? `, dont ${status.imagePages.length} en image` : ""}`
        : null,
    },
    {
      label: aiLabel ? "Analyse du cours par l'IA" : "Extraction simple (sans IA)",
      done: false,
      active: extracted,
      detail: aiLabel ? `${aiLabel} lit le cours : vocabulaire, grammaire, phrases, corrections.` : null,
    },
    { label: "Préparation de la validation", done: false },
  ];
  const mm = Math.floor(elapsed / 60);
  const ss = String(elapsed % 60).padStart(2, "0");

  return (
    <div className="mx-auto max-w-lg rounded-2xl border bg-card p-6" role="status" aria-live="polite">
      <h2 className="mb-4 font-semibold">Analyse du cours…</h2>
      <ol className="space-y-4">
        {steps.map((s, i) => (
          <li key={i} className="flex gap-3">
            <span
              className={cn(
                "mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full border text-xs",
                s.done ? "border-success bg-success text-white" : s.active ? "border-primary text-primary" : "text-muted-foreground",
              )}
            >
              {s.done ? <Check className="size-3.5" aria-hidden /> : s.active ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : i + 1}
            </span>
            <div>
              <p className={cn("text-sm font-medium", !s.done && !s.active && "text-muted-foreground")}>{s.label}</p>
              {s.detail && <p className="text-xs text-muted-foreground">{s.detail}</p>}
            </div>
          </li>
        ))}
      </ol>
      <p className="mt-6 text-xs text-muted-foreground">
        Temps écoulé : {mm}:{ss}
        {aiLabel ? " · l'analyse IA d'un cours de 20 pages prend en général 1 à 3 minutes. Tu peux quitter cette page : elle continue en arrière-plan." : ""}
      </p>
    </div>
  );
}
