"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

/** Suivi de l'analyse d'une ressource (étapes réelles, temps écoulé). */
export function ResourceProgress({
  lessonId,
  aiLabel,
  startedAt,
  whisper = null,
}: {
  lessonId: string;
  aiLabel: string | null;
  startedAt: string;
  /** Vidéo sans sous-titres : transcription Whisper (durée transcrite en secondes), sinon null. */
  whisper?: { seconds: number | null; initialStatus: string } | null;
}) {
  const router = useRouter();
  const [elapsed, setElapsed] = useState(0);
  const [transcribing, setTranscribing] = useState(whisper?.initialStatus === "EXTRACTING");
  const [progress, setProgress] = useState<number | null>(null);

  useEffect(() => {
    let stop = false;
    const poll = async () => {
      try {
        const res = await fetch(`/api/lessons/${lessonId}/status`, {
          cache: "no-store",
        });
        if (res.ok) {
          const s = (await res.json()) as {
            status: string;
            transcription: number | null;
          };
          if (stop) return;
          setTranscribing(s.status === "EXTRACTING");
          setProgress(s.transcription);
          if (s.status !== "ANALYZING" && s.status !== "EXTRACTING" && s.status !== "UPLOADED") {
            router.refresh();
            return;
          }
        }
      } catch {
        // réseau indisponible : on réessaie au prochain tour
      }
      if (!stop) setTimeout(poll, 2000);
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

  const minutes = whisper?.seconds ? Math.max(1, Math.round(whisper.seconds / 60)) : null;
  const first = whisper
    ? {
        label: transcribing
          ? progress === null || progress === 0
            ? "Téléchargement de l'audio et préparation de Whisper"
            : `Transcription de l'audio par Whisper : ${Math.round(progress * 100)} %`
          : "Transcription de l'audio par Whisper",
        done: !transcribing,
        active: transcribing,
        detail: transcribing
          ? `Sur ton ordinateur, sans envoyer l'audio ailleurs.${minutes ? ` Environ ${minutes * 2} minutes pour ${minutes} minute${minutes > 1 ? "s" : ""} de vidéo.` : ""}`
          : null,
      }
    : { label: "Lecture du contenu", done: true };
  const steps: {
    label: string;
    done?: boolean;
    active?: boolean;
    detail?: string | null;
  }[] = [
    first,
    {
      label: "Découpage en mots et comparaison avec tes connaissances",
      done: !transcribing,
    },
    {
      label: aiLabel ? "Sens en contexte et pinyin par l'IA" : "Sens du dictionnaire HSK (sans IA)",
      active: !transcribing,
      detail: !transcribing && aiLabel ? `${aiLabel} explique les mots nouveaux et repère les expressions.` : null,
    },
    { label: "Préparation de la sélection", done: false },
  ];
  const mm = Math.floor(elapsed / 60);
  const ss = String(elapsed % 60).padStart(2, "0");

  return (
    <div className="mx-auto max-w-lg rounded-2xl border bg-card p-6" role="status" aria-live="polite">
      <h2 className="mb-4 font-semibold">{transcribing ? "Transcription de la vidéo…" : "Analyse de la ressource…"}</h2>
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
        {transcribing
          ? " · tu peux quitter cette page : la transcription continue en arrière-plan (garde l'application ouverte)."
          : aiLabel
            ? " · en général 30 secondes à 2 minutes. Tu peux quitter cette page : l'analyse continue en arrière-plan."
            : ""}
      </p>
    </div>
  );
}
