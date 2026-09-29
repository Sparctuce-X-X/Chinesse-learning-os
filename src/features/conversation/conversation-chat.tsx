"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, Flag, Loader2, Mic, Send, Square } from "lucide-react";
import { toast } from "sonner";
import { endConversationAction, sendConversationMessageAction } from "@/app/actions";
import type { ConversationSummary, SpeakingFeedback } from "@/lib/ai/schemas";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { SpeakButton } from "@/components/speak-button";
import { ProvenanceBadge } from "@/components/badges";
import { FeedbackView } from "@/features/speaking/speaking-practice";
import { useVoiceInput } from "@/features/speaking/use-voice-input";
import { cn } from "@/lib/utils";

interface Turn {
  id: string;
  role: "USER" | "ASSISTANT";
  hanzi: string;
  pinyin: string | null;
  french: string | null;
  feedback: Partial<SpeakingFeedback> | null;
}

export function ConversationChat({
  id,
  title,
  situation,
  role,
  targets,
  completed,
  summary,
  turns,
}: {
  id: string;
  title: string;
  situation: string;
  role: string | null;
  targets: { vocabulary: string[]; grammar: string[] };
  completed: boolean;
  summary: ConversationSummary | null;
  turns: Turn[];
}) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [voiceMeta, setVoiceMeta] = useState<{ duration: number } | null>(null);
  const [showHelp, setShowHelp] = useState<Record<string, boolean>>({});
  const [pending, start] = useTransition();
  const [ending, setEnding] = useState(false);
  const voice = useVoiceInput();
  const bottom = useRef<HTMLDivElement>(null);
  const userTurns = turns.filter((t) => t.role === "USER").length;

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [turns.length, pending]);

  const send = () => {
    const msg = text.trim();
    if (!msg) return;
    const mode = voiceMeta ? "VOICE" : "TEXT";
    start(async () => {
      const res = await sendConversationMessageAction(id, msg, mode, voiceMeta?.duration);
      if (!res.ok) toast.error(res.error);
      else {
        setText("");
        setVoiceMeta(null);
        if (res.data.shouldEnd) toast.info("La conversation arrive à sa conclusion : tu peux la terminer pour voir ton bilan.");
      }
      router.refresh();
    });
  };

  const toggleVoice = async () => {
    if (voice.state === "recording") {
      const r = await voice.stop();
      setText((t) => (t ? `${t} ${r.transcript}` : r.transcript).trim());
      setVoiceMeta({ duration: r.durationSeconds });
    } else {
      await voice.start();
    }
  };

  const end = async () => {
    setEnding(true);
    const res = await endConversationAction(id);
    setEnding(false);
    if (!res.ok) toast.error(res.error);
    router.refresh();
  };

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <header className="rounded-2xl border bg-card p-4">
        <h1 className="text-lg font-semibold">{title}</h1>
        <p className="text-sm">{situation}</p>
        {role && <p className="text-sm text-muted-foreground">{role}</p>}
        {(targets.vocabulary.length > 0 || targets.grammar.length > 0) && (
          <details className="mt-2 text-sm">
            <summary className="cursor-pointer text-muted-foreground">Connaissances qui pourraient servir</summary>
            <p lang="zh-CN" className="mt-1">
              {[...targets.vocabulary, ...targets.grammar].join("、")}
            </p>
          </details>
        )}
      </header>

      <ol className="space-y-3" aria-live="polite">
        {turns.map((t) => (
          <li key={t.id} className={cn("flex", t.role === "USER" ? "justify-end" : "justify-start")}>
            <div className={cn("max-w-[85%] rounded-2xl px-4 py-3", t.role === "USER" ? "bg-primary text-primary-foreground" : "border bg-card")}>
              <p lang="zh-CN" className="text-lg leading-relaxed">
                {t.hanzi}
              </p>
              {t.role === "ASSISTANT" && (
                <>
                  {showHelp[t.id] && (
                    <div className="mt-1 space-y-0.5 text-sm">
                      {t.pinyin && <p className="text-muted-foreground">{t.pinyin}</p>}
                      {t.french && <p>{t.french}</p>}
                    </div>
                  )}
                  <div className="mt-2 flex items-center gap-1">
                    <SpeakButton text={t.hanzi} size="icon-sm" label="Écouter" />
                    <Button variant="ghost" size="sm" onClick={() => setShowHelp((s) => ({ ...s, [t.id]: !s[t.id] }))} aria-pressed={!!showHelp[t.id]}>
                      {showHelp[t.id] ? <EyeOff /> : <Eye />} {showHelp[t.id] ? "Masquer" : "Pinyin et traduction"}
                    </Button>
                    <ProvenanceBadge source="AI" compact />
                  </div>
                </>
              )}
              {t.role === "USER" && t.feedback && (t.feedback.corrections?.length || t.feedback.correctedSentence) ? (
                <div className="mt-2 rounded-xl bg-card p-3 text-foreground">
                  <FeedbackView
                    compact
                    feedback={{
                      corrections: t.feedback.corrections ?? [],
                      correctedSentence: t.feedback.correctedSentence ?? null,
                      correctedPinyin: t.feedback.correctedPinyin ?? null,
                      targetsUsed: t.feedback.targetsUsed ?? [],
                    }}
                  />
                </div>
              ) : null}
            </div>
          </li>
        ))}
        {pending && (
          <li className="flex justify-start">
            <div className="flex items-center gap-2 rounded-2xl border bg-card px-4 py-3 text-sm text-muted-foreground" role="status">
              <Loader2 className="size-4 animate-spin" aria-hidden /> Ton interlocuteur réfléchit…
            </div>
          </li>
        )}
      </ol>
      <div ref={bottom} />

      {completed ? (
        <section className="rounded-2xl border bg-card p-5">
          <h2 className="mb-2 font-semibold">Bilan de la conversation</h2>
          {summary ? (
            <div className="space-y-3 text-sm">
              <p>{summary.summaryFr}</p>
              {summary.strengths.length > 0 && (
                <div>
                  <p className="font-medium text-success">Points forts</p>
                  <ul className="list-disc pl-5">
                    {summary.strengths.map((s, i) => (
                      <li key={i}>{s}</li>
                    ))}
                  </ul>
                </div>
              )}
              {summary.toReview.length > 0 && (
                <div>
                  <p className="font-medium">À retravailler</p>
                  <ul className="list-disc pl-5">
                    {summary.toReview.map((s, i) => (
                      <li key={i} lang="zh-CN">
                        {s}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {summary.targetsUsed.length > 0 && (
                <p className="text-success">
                  ✓ Réutilisé : <span lang="zh-CN">{summary.targetsUsed.join("、")}</span>
                </p>
              )}
              <p className="text-xs text-muted-foreground">Les erreurs sur tes connaissances ciblées ont été ajoutées à tes erreurs et reviendront en révision.</p>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Conversation terminée sans échange.</p>
          )}
        </section>
      ) : (
        <div className="sticky bottom-16 space-y-2 rounded-2xl border bg-card p-3 shadow-sm md:bottom-4">
          {voice.error && (
            <p role="alert" className="text-sm text-destructive">
              {voice.error}
            </p>
          )}
          {voice.state === "recording" && (
            <p lang="zh-CN" className="text-sm text-muted-foreground">
              🎙️ {voice.partial || "Parle maintenant…"} ({voice.elapsed}s)
            </p>
          )}
          {voice.transcribing && (
            <p role="status" className="text-sm text-muted-foreground">
              Transcription en cours… (la toute première fois, téléchargement du modèle : ~1 min)
            </p>
          )}
          <div className="flex items-end gap-2">
            {voice.support?.mic !== false && (
              <Button
                variant={voice.state === "recording" ? "destructive" : "outline"}
                size="icon-lg"
                className="size-11 shrink-0 rounded-full"
                onClick={toggleVoice}
                disabled={pending || voice.state === "requesting" || voice.state === "processing"}
                aria-label={voice.state === "recording" ? "Arrêter l'enregistrement" : "Répondre à voix haute"}
              >
                {voice.state === "recording" ? <Square /> : <Mic />}
              </Button>
            )}
            <label htmlFor="message" className="sr-only">
              Ta réponse
            </label>
            <Textarea
              id="message"
              lang="zh-CN"
              rows={1}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
              placeholder="Réponds en chinois…"
              className="min-h-11 flex-1 text-base"
              disabled={pending}
            />
            <Button size="icon-lg" className="size-11 shrink-0 rounded-full" onClick={send} disabled={pending || !text.trim()} aria-label="Envoyer">
              <Send />
            </Button>
          </div>
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>{voiceMeta ? "Réponse dictée : tu peux corriger la transcription avant d'envoyer." : "Entrée pour envoyer"}</span>
            <Button variant="ghost" size="xs" onClick={end} disabled={pending || ending || userTurns === 0}>
              {ending ? <Loader2 className="animate-spin" aria-hidden /> : <Flag />} Terminer et voir le bilan
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
