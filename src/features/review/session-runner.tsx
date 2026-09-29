"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bot, Check, HelpCircle, Loader2, Moon, RotateCcw, X } from "lucide-react";
import { toast } from "sonner";
import { completeSessionAction, submitAnswerAction } from "@/app/actions";
import type { PublicExercise } from "@/lib/review/exercises";
import { EXERCISE_LABEL } from "@/lib/review/exercises";
import type { Reveal, SessionView, SubmitOutcome } from "@/server/review";
import type { StopReason } from "@/lib/review/pace";
import { numberedToMarked } from "@/lib/chinese/pinyin";
import { normalizeHanzi } from "@/lib/chinese/text";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { ResultLabel } from "@/components/badges";
import { SpeakButton } from "@/components/speak-button";
import { getSpeechProvider } from "@/lib/audio/speech";
import { cn } from "@/lib/utils";

type Phase =
  | { kind: "answering" }
  | { kind: "judging"; answer: string; reveal: Reveal; aiAvailable: boolean }
  | { kind: "feedback"; answer: string; outcome: Extract<SubmitOutcome, { status: "final" }> };

const REASON_LABEL: Record<PublicExercise["reason"], string | null> = {
  new: "Nouveau",
  due: null,
  mistake: "Erreur à retravailler",
  relearn: "On y revient",
  prep: "Préparation du cours",
  extra: null,
};

export function SessionRunner({ initial }: { initial: SessionView }) {
  const router = useRouter();
  const [view, setView] = useState<SessionView>(initial);
  const [phase, setPhase] = useState<Phase>({ kind: "answering" });
  const [answer, setAnswer] = useState("");
  const [tiles, setTiles] = useState<{ picked: number[] }>({ picked: [] });
  const [pending, startTransition] = useTransition();
  const [aiPending, setAiPending] = useState(false);
  const [finishing, setFinishing] = useState(false);
  // Propositions d'arrêt déjà refusées dans cette session (on ne les répète pas, même après rechargement).
  const [declined, setDeclined] = useState<StopReason[]>(() => {
    try {
      return JSON.parse(sessionStorage.getItem(`clos:stop-declined:${initial.id}`) ?? "[]") as StopReason[];
    } catch {
      return [];
    }
  });
  const shownAt = useRef<number>(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const continueRef = useRef<HTMLButtonElement>(null);

  const ex = view.exercise;

  useEffect(() => {
    shownAt.current = Date.now();
    if (phase.kind === "answering") inputRef.current?.focus();
    if (phase.kind === "feedback") continueRef.current?.focus();
  }, [ex?.key, phase.kind]);

  const finish = useCallback(async () => {
    setFinishing(true);
    const res = await completeSessionAction(view.id);
    if (!res.ok) {
      toast.error(res.error);
      setFinishing(false);
      return;
    }
    router.replace(`/session/${view.id}/resume`);
  }, [router, view.id]);

  const currentAnswer = ex?.prompt.tiles ? tiles.picked.map((i) => ex.prompt.tiles![i]).join("") : answer;

  const submit = (opts: { dontKnow?: boolean; selfResult?: "CORRECT" | "MOSTLY_CORRECT" | "INCORRECT"; useAI?: boolean; skipUnavailable?: boolean } = {}) => {
    if (!ex) return;
    const given = phase.kind === "judging" ? phase.answer : currentAnswer;
    if (!opts.dontKnow && !opts.skipUnavailable && !opts.selfResult && !opts.useAI && !given.trim()) {
      inputRef.current?.focus();
      return;
    }
    const responseTimeMs = Date.now() - shownAt.current;
    if (opts.useAI) setAiPending(true);
    startTransition(async () => {
      const res = await submitAnswerAction(view.id, { index: view.index, answer: given, responseTimeMs, ...opts });
      setAiPending(false);
      if (!res.ok) {
        toast.error(res.error);
        if (/déjà été traité/.test(res.error)) router.refresh();
        return;
      }
      const out = res.data;
      if (out.status === "needs_judgment") {
        setPhase({ kind: "judging", answer: given, reveal: out.reveal, aiAvailable: out.aiAvailable });
        return;
      }
      getSpeechProvider().cancel();
      setPhase({ kind: "feedback", answer: opts.dontKnow ? "" : given, outcome: out });
    });
  };

  const stopOffer = phase.kind === "feedback" && !phase.outcome.next.completed ? phase.outcome.next.suggestStop : null;
  const offered = stopOffer && !declined.includes(stopOffer) ? stopOffer : null;

  const next = () => {
    if (phase.kind !== "feedback" || finishing) return;
    if (offered) {
      const list = [...declined, offered];
      setDeclined(list);
      try {
        sessionStorage.setItem(`clos:stop-declined:${view.id}`, JSON.stringify(list));
      } catch {
        // stockage indisponible : la proposition pourra revenir après un rechargement
      }
    }
    if (phase.outcome.next.completed) {
      void finish();
      return;
    }
    setView(phase.outcome.next);
    setAnswer("");
    setTiles({ picked: [] });
    setPhase({ kind: "answering" });
  };

  // Raccourcis clavier
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (pending) return;
      const target = e.target as HTMLElement;
      const typing = target.tagName === "INPUT" || target.tagName === "TEXTAREA";
      if (phase.kind === "feedback" && e.key === "Enter") {
        e.preventDefault();
        next();
      } else if (phase.kind === "judging" && !typing) {
        if (e.key === "1") submit({ selfResult: "CORRECT" });
        if (e.key === "2") submit({ selfResult: "MOSTLY_CORRECT" });
        if (e.key === "3") submit({ selfResult: "INCORRECT" });
      } else if (phase.kind === "answering" && ex?.prompt.tiles && e.key === "Enter" && !typing) {
        e.preventDefault();
        submit();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const total = phase.kind === "feedback" ? phase.outcome.next.total : view.total;
  const done = phase.kind === "feedback" ? phase.outcome.next.index : view.index;
  const progress = total ? Math.round((done / total) * 100) : 0;
  const displayIndex = Math.min(view.index + 1, total);

  if (finishing || (!ex && phase.kind === "answering")) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 text-muted-foreground" role="status">
        <Loader2 className="size-6 animate-spin" aria-hidden />
        Enregistrement de la session…
      </div>
    );
  }

  const shown = phase.kind === "feedback" ? null : ex;

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-xl flex-col px-4 pb-6 pt-4 sm:pt-8">
      <header className="mb-6 flex items-center gap-3">
        <Button asChild variant="ghost" size="icon" aria-label="Quitter la session (la progression est enregistrée)">
          <Link href="/">
            <X />
          </Link>
        </Button>
        <Progress value={progress} className="h-2 flex-1" aria-label="Progression de la session" />
        <span className="min-w-12 text-right text-sm tabular-nums text-muted-foreground" aria-live="polite">
          {displayIndex} / {total}
        </span>
      </header>

      <div className="flex flex-1 flex-col">
        {shown && (
          <section aria-labelledby="exercise-instruction" className="flex flex-1 flex-col">
            <div className="mb-2 flex flex-wrap items-center gap-2 text-xs font-medium text-muted-foreground">
              <span className="rounded-full bg-muted px-2 py-0.5">{EXERCISE_LABEL[shown.type]}</span>
              {REASON_LABEL[shown.reason] && (
                <span className={cn("rounded-full px-2 py-0.5", shown.reason === "mistake" || shown.reason === "relearn" ? "bg-danger-soft text-destructive" : "bg-accent text-accent-foreground")}>
                  {REASON_LABEL[shown.reason]}
                </span>
              )}
            </div>
            <h1 id="exercise-instruction" className="text-lg font-medium">
              {shown.prompt.instruction}
            </h1>

            <div className="my-8 flex min-h-32 flex-col items-center justify-center gap-4 text-center">
              {shown.prompt.audioText && (
                <SpeakAndSkip
                  text={shown.prompt.audioText}
                  onUnavailable={() => submit({ skipUnavailable: true })}
                  disabled={pending || phase.kind !== "answering"}
                />
              )}
              {shown.prompt.display && (
                <p
                  lang={shown.prompt.displayIsChinese ? "zh-CN" : undefined}
                  className={cn(
                    "break-words",
                    shown.prompt.displayIsChinese
                      ? cn("font-hanzi leading-snug", [...shown.prompt.display].length <= 4 ? "text-6xl sm:text-7xl" : [...shown.prompt.display].length <= 12 ? "text-4xl" : "text-2xl sm:text-3xl")
                      : "text-2xl font-semibold sm:text-3xl",
                  )}
                >
                  {shown.prompt.display}
                </p>
              )}
              {shown.prompt.hint && <p className="text-sm text-muted-foreground">{shown.prompt.hint}</p>}
            </div>

            {phase.kind === "answering" && (
              <form
                className="mt-auto space-y-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  submit();
                }}
              >
                {shown.prompt.tiles ? (
                  <TilePicker tiles={shown.prompt.tiles} picked={tiles.picked} onChange={(picked) => setTiles({ picked })} disabled={pending} />
                ) : (
                  <div>
                    <label htmlFor="answer" className="sr-only">
                      Ta réponse
                    </label>
                    <Input
                      id="answer"
                      ref={inputRef}
                      value={answer}
                      onChange={(e) => setAnswer(e.target.value)}
                      placeholder={shown.prompt.inputPlaceholder ?? "Ta réponse"}
                      autoComplete="off"
                      autoCorrect="off"
                      autoCapitalize="off"
                      spellCheck={false}
                      className="h-14 text-center text-xl"
                      disabled={pending}
                    />
                    {/[1-5]/.test(answer) && /[a-z]/i.test(answer) && (
                      <p className="mt-1 text-center text-sm text-muted-foreground" aria-live="polite">
                        {numberedToMarked(answer)}
                      </p>
                    )}
                  </div>
                )}
                <div className="grid grid-cols-[auto_1fr] gap-2">
                  <Button type="button" variant="ghost" size="lg" className="h-12" onClick={() => submit({ dontKnow: true })} disabled={pending}>
                    <HelpCircle /> Je ne sais pas
                  </Button>
                  <Button type="submit" size="lg" className="h-12 text-base" disabled={pending || !currentAnswer.trim()}>
                    {pending ? <Loader2 className="animate-spin" aria-hidden /> : null}
                    Valider
                  </Button>
                </div>
                <p className="hidden text-center text-xs text-muted-foreground sm:block">Entrée pour valider</p>
              </form>
            )}

            {phase.kind === "judging" && (
              <div className="mt-auto space-y-4">
                <AnswerComparison answer={phase.answer} reveal={phase.reveal} />
                <p className="text-center text-sm font-medium">La correction automatique n&apos;est pas sûre. Comment as-tu répondu ?</p>
                <div className="grid grid-cols-3 gap-2">
                  <Button size="lg" variant="outline" className="h-14 flex-col gap-0 border-success/40" onClick={() => submit({ selfResult: "CORRECT" })} disabled={pending}>
                    <span className="flex items-center gap-1 text-success">
                      <Check /> J&apos;avais bon
                    </span>
                    <span className="hidden text-[10px] text-muted-foreground sm:block">touche 1</span>
                  </Button>
                  <Button size="lg" variant="outline" className="h-14 flex-col gap-0 border-warning/40" onClick={() => submit({ selfResult: "MOSTLY_CORRECT" })} disabled={pending}>
                    <span className="text-warning">≈ Presque</span>
                    <span className="hidden text-[10px] text-muted-foreground sm:block">touche 2</span>
                  </Button>
                  <Button size="lg" variant="outline" className="h-14 flex-col gap-0 border-destructive/40" onClick={() => submit({ selfResult: "INCORRECT" })} disabled={pending}>
                    <span className="flex items-center gap-1 text-destructive">
                      <X /> Faux
                    </span>
                    <span className="hidden text-[10px] text-muted-foreground sm:block">touche 3</span>
                  </Button>
                </div>
                {phase.aiAvailable && (
                  <Button variant="ghost" className="w-full" onClick={() => submit({ useAI: true })} disabled={pending}>
                    {aiPending ? <Loader2 className="animate-spin" aria-hidden /> : <Bot />}
                    {aiPending ? "L'IA évalue ta réponse…" : "Demander à l'IA de corriger"}
                  </Button>
                )}
              </div>
            )}
          </section>
        )}

        {phase.kind === "feedback" && (
          <section aria-live="polite" className="flex flex-1 flex-col">
            <div className="mb-4 flex items-center gap-2">
              <ResultLabel result={phase.outcome.result} className="text-base" />
              {phase.outcome.relearnQueued && <span className="text-xs text-muted-foreground">· reviendra dans quelques questions</span>}
            </div>
            <AnswerComparison answer={phase.answer} reveal={phase.outcome.reveal} result={phase.outcome.result} />
            {phase.outcome.feedback && <p className="mt-4 rounded-lg bg-muted/70 px-4 py-3 text-sm">{phase.outcome.feedback}</p>}
            {phase.outcome.mistakeRecurring && (
              <p className="mt-3 flex items-center gap-2 text-sm text-destructive">
                <RotateCcw className="size-4" aria-hidden /> Erreur récurrente : elle sera revue en priorité.
              </p>
            )}
            {offered && (
              <div role="status" className="mt-6 rounded-xl border border-primary/30 bg-primary/5 p-4 text-sm">
                <p className="flex items-center gap-2 font-semibold">
                  <Moon className="size-4 text-primary" aria-hidden />
                  {offered === "fatigue" ? "Tu fatigues, on s'arrête là ?" : "Tu as largement dépassé la durée prévue, on s'arrête là ?"}
                </p>
                <p className="mt-1 text-muted-foreground">
                  {offered === "fatigue" ? "Beaucoup d'erreurs sur les dernières questions : c'est souvent la fatigue. " : ""}
                  Rien n&apos;est perdu : {phase.outcome.next.total - phase.outcome.next.index > 1 ? `les ${phase.outcome.next.total - phase.outcome.next.index} exercices restants reviendront` : "l'exercice restant reviendra"} dans tes
                  prochaines sessions.
                </p>
                <Button className="mt-3 w-full sm:w-auto" onClick={() => void finish()}>
                  Terminer maintenant
                </Button>
              </div>
            )}
            <div className="mt-auto pt-8">
              <Button ref={continueRef} size="lg" variant={offered ? "outline" : "default"} className="h-12 w-full text-base" onClick={next}>
                {phase.outcome.next.completed ? "Terminer la session" : offered ? "Continuer quand même" : "Continuer"}
              </Button>
              <p className="mt-2 hidden text-center text-xs text-muted-foreground sm:block">Entrée pour continuer</p>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

function AnswerComparison({ answer, reveal, result }: { answer: string; reveal: Reveal; result?: string }) {
  const expectedIsChinese = /[㐀-鿿]/.test(reveal.expected);
  const primary = reveal.hanzi ?? (expectedIsChinese ? reveal.expected : null);
  return (
    <div className="space-y-4">
      {result !== "CORRECT" && (
        <div className="rounded-xl border bg-card px-4 py-3">
          <p className="text-xs font-medium text-muted-foreground">Ta réponse</p>
          <p lang={/[㐀-鿿]/.test(answer) ? "zh-CN" : undefined} className={cn("text-lg", !answer && "italic text-muted-foreground")}>
            {answer || "Pas de réponse"}
          </p>
        </div>
      )}
      <div className="rounded-xl border border-primary/25 bg-accent/40 px-4 py-4 text-center">
        <p className="mb-1 text-xs font-medium text-muted-foreground">{result === "CORRECT" ? "Réponse" : "Réponse attendue"}</p>
        {primary && (
          <p lang="zh-CN" className={cn("font-hanzi", [...primary].length <= 4 ? "text-5xl" : "text-3xl")}>
            {primary}
          </p>
        )}
        {!expectedIsChinese || !primary || normalizeHanzi(reveal.expected) !== normalizeHanzi(primary) ? (
          reveal.expected !== reveal.french && reveal.expected !== reveal.english && (
            <p lang={expectedIsChinese ? "zh-CN" : undefined} className="mt-1 text-lg font-medium">
              {reveal.expected}
            </p>
          )
        ) : null}
        {reveal.pinyin && <p className="mt-1 text-lg text-muted-foreground">{reveal.pinyin}</p>}
        {(reveal.french || reveal.english) && (
          <p className="mt-1">
            {reveal.french ?? reveal.english}
            {!reveal.french && reveal.english && <span className="text-xs text-muted-foreground"> (anglais)</span>}
          </p>
        )}
        {reveal.note && (
          <p lang="zh-CN" className="mt-3 border-t pt-3 text-base text-muted-foreground">
            {reveal.note}
          </p>
        )}
        {reveal.audioText && (
          <div className="mt-3 flex justify-center">
            <SpeakButton text={reveal.audioText} size="sm" />
          </div>
        )}
      </div>
    </div>
  );
}

function TilePicker({ tiles, picked, onChange, disabled }: { tiles: string[]; picked: number[]; onChange: (p: number[]) => void; disabled?: boolean }) {
  return (
    <div className="space-y-4">
      <div className="flex min-h-16 flex-wrap items-center justify-center gap-2 rounded-xl border-2 border-dashed px-3 py-3" aria-label="Ta phrase">
        {picked.length === 0 && <span className="text-sm text-muted-foreground">Touche les éléments dans l&apos;ordre</span>}
        {picked.map((i, pos) => (
          <button
            key={`${i}-${pos}`}
            type="button"
            lang="zh-CN"
            disabled={disabled}
            onClick={() => onChange(picked.filter((_, p) => p !== pos))}
            className="rounded-lg bg-primary px-3 py-2 text-xl text-primary-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
            aria-label={`Retirer ${tiles[i]}`}
          >
            {tiles[i]}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap justify-center gap-2">
        {tiles.map((t, i) => {
          const used = picked.includes(i);
          return (
            <button
              key={i}
              type="button"
              lang="zh-CN"
              disabled={used || disabled}
              onClick={() => onChange([...picked, i])}
              className={cn(
                "min-h-12 min-w-12 rounded-lg border bg-card px-3 py-2 text-xl shadow-xs transition focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                used ? "opacity-30" : "hover:border-primary",
              )}
            >
              {t}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function SpeakAndSkip({ text, onUnavailable, disabled }: { text: string; onUnavailable: () => void; disabled?: boolean }) {
  const [supported, setSupported] = useState<boolean | null>(null);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSupported(getSpeechProvider().canSynthesize());
  }, []);
  if (supported === false) {
    return (
      <div className="space-y-2 text-sm text-muted-foreground">
        <p>La synthèse vocale n&apos;est pas disponible dans ce navigateur.</p>
        <Button variant="outline" onClick={onUnavailable} disabled={disabled}>
          Passer cet exercice
        </Button>
      </div>
    );
  }
  return <SpeakButton text={text} size="lg" label="Écouter" autoPlay showSlow />;
}
