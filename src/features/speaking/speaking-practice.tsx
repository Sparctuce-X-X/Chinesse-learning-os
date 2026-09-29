"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Loader2, Mic, Square, Keyboard, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import type { SpeakingPrompt } from "@/server/speaking";
import type { SpeakingFeedback } from "@/lib/ai/schemas";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { ProvenanceBadge, ResultLabel } from "@/components/badges";
import { SpeakButton } from "@/components/speak-button";
import { CATEGORY_LABEL_FR } from "./labels";
import { useVoiceInput } from "./use-voice-input";
import { cn } from "@/lib/utils";

type Stage =
  | { kind: "ready" }
  | { kind: "review"; transcript: string; audio: Blob | null; duration: number | null; mode: "VOICE" | "TEXT" }
  | { kind: "sending" }
  | { kind: "done"; feedback: SpeakingFeedback | null; reason?: string; transcript: string; audioUrl: string | null };

export function SpeakingPractice({ prompts: initialPrompts, aiAvailable }: { prompts: SpeakingPrompt[]; aiAvailable: boolean }) {
  const router = useRouter();
  // Liste figée pendant l'entraînement (le serveur la recalcule après chaque réponse).
  const [prompts] = useState(initialPrompts);
  const [index, setIndex] = useState(0);
  const [stage, setStage] = useState<Stage>({ kind: "ready" });
  const voice = useVoiceInput();
  const prompt = prompts[index];

  const record = async () => {
    if (voice.state === "recording") {
      const r = await voice.stop();
      setStage({ kind: "review", transcript: r.transcript, audio: r.audio, duration: r.durationSeconds, mode: "VOICE" });
    } else {
      await voice.start();
    }
  };

  const send = async () => {
    if (stage.kind !== "review" || !stage.transcript.trim()) return;
    const body = new FormData();
    body.append("prompt", prompt.questionHanzi ?? prompt.instructionFr);
    if (prompt.questionHanzi) body.append("questionHanzi", prompt.questionHanzi);
    body.append("instructionFr", prompt.instructionFr);
    body.append("targetIds", prompt.targets.map((t) => t.knowledgeItemId).join(","));
    body.append("transcription", stage.transcript);
    body.append("inputMode", stage.mode);
    if (stage.duration) body.append("durationSeconds", String(stage.duration));
    if (stage.audio) body.append("audio", stage.audio, "reponse.webm");
    const audioUrl = stage.audio ? URL.createObjectURL(stage.audio) : null;
    const transcript = stage.transcript;
    setStage({ kind: "sending" });
    try {
      const res = await fetch("/api/speaking", { method: "POST", body });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Échec de l'envoi.");
      if (data.status === "evaluated") setStage({ kind: "done", feedback: data.feedback, transcript, audioUrl });
      else setStage({ kind: "done", feedback: null, reason: data.reason, transcript, audioUrl });
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Échec de l'envoi.");
      setStage({ kind: "review", transcript, audio: null, duration: null, mode: "TEXT" });
    }
  };

  const next = () => {
    setStage({ kind: "ready" });
    setIndex((i) => (i + 1) % prompts.length);
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="Exercices d'oral">
        {prompts.map((p, i) => (
          <button
            key={p.key}
            role="tab"
            aria-selected={i === index}
            onClick={() => {
              setIndex(i);
              setStage({ kind: "ready" });
            }}
            className={cn(
              "shrink-0 rounded-full border px-3 py-1.5 text-sm",
              i === index ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:border-primary/40",
            )}
          >
            {i + 1}. {p.kind === "TEACHER_QUESTION" ? "Question du cours" : p.kind === "GRAMMAR" ? "Grammaire" : "Vocabulaire"}
          </button>
        ))}
      </div>

      <section className="rounded-2xl border bg-card p-5 sm:p-6" aria-live="polite">
        <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          {prompt.lessonTitle && <span>{prompt.lessonTitle}</span>}
          {prompt.kind === "TEACHER_QUESTION" && <ProvenanceBadge source={prompt.sourceType} />}
        </div>
        <p className="font-medium">{prompt.instructionFr}</p>
        {prompt.questionHanzi && (
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <p lang="zh-CN" className="font-hanzi text-2xl sm:text-3xl">
              {prompt.questionHanzi}
            </p>
            <SpeakButton text={prompt.questionHanzi} size="icon" label="Écouter la question" />
          </div>
        )}
        {prompt.context && <p className="mt-2 text-sm text-muted-foreground">{prompt.context}</p>}
        {prompt.targets.length > 0 && (
          <div className="mt-4">
            <p className="mb-1.5 text-xs font-medium text-muted-foreground">Essaie de réutiliser :</p>
            <ul className="flex flex-wrap gap-2">
              {prompt.targets.map((t) => (
                <li key={t.knowledgeItemId} className="rounded-lg bg-accent px-2.5 py-1 text-sm text-accent-foreground">
                  <span lang="zh-CN" className="font-cjk">{t.label}</span>
                  {t.pinyin && <span className="ml-1.5 text-xs opacity-80">{t.pinyin}</span>}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="mt-6">
          {stage.kind === "ready" && (
            <div className="flex flex-col items-center gap-3">
              {voice.support?.mic !== false ? (
                <>
                  <Button
                    size="lg"
                    onClick={record}
                    disabled={voice.state === "requesting" || voice.state === "processing"}
                    className={cn("size-20 rounded-full", voice.state === "recording" && "bg-destructive hover:bg-destructive/90")}
                    aria-label={voice.state === "recording" ? "Arrêter l'enregistrement" : "Commencer l'enregistrement"}
                  >
                    {voice.state === "recording" ? <Square className="size-7" /> : voice.state === "idle" ? <Mic className="size-8" /> : <Loader2 className="size-7 animate-spin" />}
                  </Button>
                  <p className="text-sm text-muted-foreground">
                    {voice.state === "recording"
                      ? `Enregistrement… ${voice.elapsed}s (max ${voice.maxSeconds}s) · touche pour arrêter`
                      : voice.state === "requesting"
                        ? "Autorisation du microphone…"
                        : voice.state === "processing"
                          ? voice.transcribing
                            ? "Transcription en cours… (la toute première fois, téléchargement du modèle : ~1 min)"
                            : "Finalisation…"
                          : "Touche le micro et réponds à voix haute"}
                  </p>
                  {voice.state === "recording" && voice.partial && (
                    <p lang="zh-CN" className="text-lg">
                      {voice.partial}
                    </p>
                  )}
                  {voice.support && !voice.support.stt && (
                    <p className="text-center text-xs text-muted-foreground">La transcription automatique n&apos;est pas disponible dans ce navigateur : tu pourras taper ce que tu as dit.</p>
                  )}
                </>
              ) : (
                <p className="text-sm text-muted-foreground">Microphone indisponible dans ce navigateur.</p>
              )}
              {voice.error && (
                <p role="alert" className="text-center text-sm text-destructive">
                  {voice.error}
                </p>
              )}
              <Button variant="ghost" size="sm" onClick={() => setStage({ kind: "review", transcript: "", audio: null, duration: null, mode: "TEXT" })} disabled={voice.state === "recording"}>
                <Keyboard /> Écrire ma réponse
              </Button>
            </div>
          )}

          {stage.kind === "review" && (
            <div className="space-y-3">
              <Label htmlFor="transcript">{stage.mode === "VOICE" ? "Transcription (corrige-la si la reconnaissance s'est trompée)" : "Ta réponse en chinois"}</Label>
              <Textarea
                id="transcript"
                lang="zh-CN"
                rows={3}
                value={stage.transcript}
                onChange={(e) => setStage({ ...stage, transcript: e.target.value })}
                placeholder="例如：我去年去了北京。"
                className="text-lg"
                autoFocus
              />
              {stage.audio && <BlobAudio blob={stage.audio} />}
              <div className="flex flex-wrap justify-between gap-2">
                <Button variant="ghost" onClick={() => setStage({ kind: "ready" })}>
                  <RotateCcw /> Recommencer
                </Button>
                <Button onClick={send} disabled={!stage.transcript.trim()}>
                  {aiAvailable ? "Analyser ma réponse" : "Enregistrer ma réponse"}
                </Button>
              </div>
            </div>
          )}

          {stage.kind === "sending" && (
            <p className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground" role="status">
              <Loader2 className="size-4 animate-spin" aria-hidden /> {aiAvailable ? "L'IA analyse ta réponse…" : "Enregistrement…"}
            </p>
          )}

          {stage.kind === "done" && (
            <div className="space-y-4">
              <div className="rounded-xl bg-muted/60 px-4 py-3">
                <p className="text-xs text-muted-foreground">Tu as dit</p>
                <p lang="zh-CN" className="text-lg">
                  {stage.transcript}
                </p>
                {stage.audioUrl && <audio controls src={stage.audioUrl} className="mt-2 w-full" aria-label="Réécouter mon enregistrement" />}
              </div>
              {stage.feedback ? (
                <FeedbackView feedback={stage.feedback} />
              ) : (
                <p className="rounded-xl border px-4 py-3 text-sm">
                  Réponse enregistrée. Pas d&apos;analyse automatique : {stage.reason}
                </p>
              )}
              <Button onClick={next} className="w-full" size="lg">
                Exercice suivant <ArrowRight />
              </Button>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

export function FeedbackView({ feedback, compact }: { feedback: Pick<SpeakingFeedback, "corrections" | "correctedSentence" | "correctedPinyin" | "targetsUsed"> & Partial<SpeakingFeedback>; compact?: boolean }) {
  return (
    <div className="space-y-3">
      {feedback.result && (
        <div className="flex flex-wrap items-center gap-2">
          <ResultLabel result={feedback.result} />
          {feedback.understood === false && <span className="text-sm text-destructive">Difficile à comprendre</span>}
        </div>
      )}
      {feedback.summary && !compact && <p className="text-sm">{feedback.summary}</p>}
      {feedback.correctedSentence && (
        <div className="rounded-xl border border-primary/25 bg-accent/40 px-4 py-3">
          <p className="text-xs text-muted-foreground">Version corrigée</p>
          <div className="flex items-start justify-between gap-2">
            <div>
              <p lang="zh-CN" className="text-lg">
                {feedback.correctedSentence}
              </p>
              {feedback.correctedPinyin && <p className="text-sm text-muted-foreground">{feedback.correctedPinyin}</p>}
            </div>
            <SpeakButton text={feedback.correctedSentence} size="icon-sm" label="Écouter la correction" />
          </div>
          <div className="mt-1">
            <ProvenanceBadge source="AI" />
          </div>
        </div>
      )}
      {feedback.corrections.length > 0 && (
        <ul className="space-y-2">
          {feedback.corrections.map((c, i) => (
            <li key={i} className="rounded-lg border px-3 py-2 text-sm">
              <span className="mr-2 rounded-full bg-muted px-2 py-0.5 text-xs">{CATEGORY_LABEL_FR[c.category] ?? c.category}</span>
              <span lang="zh-CN" className="text-destructive line-through decoration-1">
                {c.original}
              </span>{" "}
              →{" "}
              <span lang="zh-CN" className="text-success">
                {c.corrected}
              </span>
              <p className="mt-1 text-muted-foreground">{c.explanation}</p>
            </li>
          ))}
        </ul>
      )}
      {!compact && ((feedback.targetsUsed?.length ?? 0) > 0 || (feedback.targetsMissing?.length ?? 0) > 0) && (
        <p className="text-sm">
          {(feedback.targetsUsed?.length ?? 0) > 0 && (
            <span className="mr-3 text-success">
              ✓ Utilisé : <span lang="zh-CN">{feedback.targetsUsed!.join("、")}</span>
            </span>
          )}
          {(feedback.targetsMissing?.length ?? 0) > 0 && (
            <span className="text-muted-foreground">
              Pas encore : <span lang="zh-CN">{feedback.targetsMissing!.join("、")}</span>
            </span>
          )}
        </p>
      )}
    </div>
  );
}

function BlobAudio({ blob }: { blob: Blob }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    const u = URL.createObjectURL(blob);
    // L'URL d'objet est créée côté client et libérée au démontage.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [blob]);
  return url ? <audio controls src={url} className="w-full" aria-label="Réécouter mon enregistrement" /> : null;
}
