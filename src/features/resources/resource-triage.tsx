"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronDown, Loader2, Pencil, Play, Plus, Trash2, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { buildManualWordAction, discardImportAction, saveDraftAction, setWordKnownAction, validateLessonAction } from "@/app/actions";
import type { Draft, DraftVocabulary } from "@/lib/ai/schemas";
import { hskLevelLabel } from "@/lib/chinese/hsk-levels";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ProvenanceBadge } from "@/components/badges";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { formatTime } from "@/lib/resources/video";
import type { ReaderData } from "@/server/resources";
import { seekVideo, VideoReader } from "./video-reader";

export interface KnownChip {
  word: string;
  count: number;
  hsk: number | null;
}

function hasMeaning(v: DraftVocabulary) {
  return !!(v.french?.trim() || v.english?.trim());
}

/** Phrase de contexte avec le mot surligné. */
function Context({ sentence, word }: { sentence: string; word: string }) {
  const parts = sentence.split(word);
  return (
    <p lang="zh-CN" className="font-cjk text-sm text-muted-foreground">
      {parts.map((p, i) => (
        <span key={i}>
          {p}
          {i < parts.length - 1 && <mark className="rounded bg-primary/15 px-0.5 text-foreground">{word}</mark>}
        </span>
      ))}
    </p>
  );
}

function WordRow({ item, onChange, onKnown }: { item: DraftVocabulary; onChange: (next: DraftVocabulary) => void; onKnown: () => void }) {
  const [editing, setEditing] = useState(false);
  const checked = item.decision === "approved";
  const meaningful = hasMeaning(item);
  const example = item.examples[0];
  const id = `w-${item.id}`;
  const setField = (key: "pinyin" | "french", value: string) =>
    onChange({
      ...item,
      [key]: value || null,
      [`${key}Source`]: "USER",
      edited: true,
    } as DraftVocabulary);

  return (
    <li className={cn("flex gap-3 rounded-xl border bg-card p-3 sm:p-4", checked && "border-primary/40 bg-primary/[0.03]")}>
      <input
        id={id}
        type="checkbox"
        className="mt-1.5 size-5 shrink-0 accent-[var(--primary)]"
        checked={checked}
        disabled={!meaningful}
        onChange={(e) =>
          onChange({
            ...item,
            decision: e.target.checked ? "approved" : "pending",
          })
        }
        aria-describedby={!meaningful ? `${id}-hint` : undefined}
      />
      <div className="min-w-0 flex-1 space-y-1.5">
        <label htmlFor={id} className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span lang="zh-CN" className="font-cjk text-xl font-medium">
            {item.hanzi}
          </span>
          {item.pinyin && <span className="text-sm text-muted-foreground">{item.pinyin}</span>}
          <span className="text-sm">{item.french ?? (item.english ? <span className="text-muted-foreground">{item.english} (anglais)</span> : null)}</span>
        </label>
        {!meaningful && (
          <p id={`${id}-hint`} className="text-xs text-warning">
            Sens inconnu : clique sur « Modifier » pour l&apos;ajouter.
          </p>
        )}
        <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
          <span className="rounded-full bg-muted px-2 py-0.5">{item.resource?.hsk ? hskLevelLabel(item.resource.hsk) : "Hors HSK"}</span>
          {item.resource && item.resource.count > 1 && <span className="rounded-full bg-muted px-2 py-0.5">{item.resource.count} fois dans le texte</span>}
          {item.kind === "EXPRESSION" && <span className="rounded-full bg-accent px-2 py-0.5 text-accent-foreground">Expression</span>}
          {item.french && <ProvenanceBadge source={item.frenchSource} />}
        </div>
        {example?.hanzi && (
          <div className="flex items-start gap-2 border-l-2 pl-3">
            <div className="min-w-0 flex-1 space-y-0.5">
              <Context sentence={example.hanzi} word={item.hanzi} />
              {example.french && <p className="text-xs text-muted-foreground">{example.french}</p>}
            </div>
            {typeof item.resource?.time === "number" && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 shrink-0 px-2 text-xs"
                onClick={() => seekVideo(item.resource!.time!)}
                aria-label={`Écouter « ${item.hanzi} » dans la vidéo, à ${formatTime(item.resource.time)}`}
              >
                <Play aria-hidden /> {formatTime(item.resource.time)}
              </Button>
            )}
          </div>
        )}
        {editing && (
          <div className="grid gap-2 pt-1 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor={`${id}-py`} className="text-xs">
                Pinyin
              </Label>
              <Input id={`${id}-py`} defaultValue={item.pinyin ?? ""} onBlur={(e) => setField("pinyin", e.target.value.trim())} />
            </div>
            <div className="space-y-1">
              <Label htmlFor={`${id}-fr`} className="text-xs">
                Français
              </Label>
              <Input
                id={`${id}-fr`}
                defaultValue={item.french ?? ""}
                onBlur={(e) => {
                  const v = e.target.value.trim();
                  setField("french", v);
                }}
              />
            </div>
          </div>
        )}
      </div>
      <div className="flex shrink-0 flex-col gap-1 sm:flex-row sm:items-start">
        <Button type="button" variant="ghost" size="sm" onClick={() => setEditing((e) => !e)} aria-pressed={editing}>
          <Pencil aria-hidden /> <span className="sr-only sm:not-sr-only">{editing ? "Fermer" : "Modifier"}</span>
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={onKnown} title="Je connais déjà ce mot : il ne sera plus proposé">
          <Check aria-hidden /> <span className="sr-only sm:not-sr-only">Je le connais</span>
        </Button>
      </div>
    </li>
  );
}

export function ResourceTriage({
  lessonId,
  initialDraft,
  initialTitle,
  titleChinese,
  ownKnown,
  presumed,
  hskLevel,
  reader = null,
}: {
  reader?: ReaderData | null;
  lessonId: string;
  initialDraft: Draft;
  initialTitle: string;
  titleChinese: string | null;
  ownKnown: KnownChip[];
  presumed: KnownChip[];
  hskLevel: number;
}) {
  const router = useRouter();
  const [draft, setDraft] = useState(initialDraft);
  const [title, setTitle] = useState(initialTitle);
  const [manual, setManual] = useState("");
  const [adding, setAdding] = useState(false);
  const [showRare, setShowRare] = useState(false);
  const [validating, startValidate] = useTransition();
  const [discarding, startDiscard] = useTransition();
  const [lastSaved, setLastSaved] = useState(() => JSON.stringify(initialDraft));
  const serialized = useMemo(() => JSON.stringify(draft), [draft]);

  // Sauvegarde automatique : les choix ne sont jamais perdus.
  useEffect(() => {
    if (serialized === lastSaved) return;
    const t = setTimeout(async () => {
      const res = await saveDraftAction(lessonId, JSON.parse(serialized) as Draft);
      if (res.ok) setLastSaved(serialized);
      else toast.error(`Sauvegarde impossible : ${res.error}`);
    }, 700);
    return () => clearTimeout(t);
  }, [serialized, lastSaved, lessonId]);

  const words = draft.vocabulary;
  const useful = words.filter((w) => w.resource?.tier !== "rare");
  const rare = words.filter((w) => w.resource?.tier === "rare");
  const selected = words.filter((w) => w.decision === "approved" && hasMeaning(w));

  const selection = useMemo(
    () => new Map(words.map((w) => [w.hanzi, w.decision === "approved" && hasMeaning(w) ? ("approved" as const) : ("pending" as const)])),
    [words],
  );

  const update = (next: DraftVocabulary) =>
    setDraft((d) => ({
      ...d,
      vocabulary: d.vocabulary.map((w) => (w.id === next.id ? next : w)),
    }));
  const remove = (id: string) =>
    setDraft((d) => ({
      ...d,
      vocabulary: d.vocabulary.filter((w) => w.id !== id),
    }));

  const markKnown = async (item: DraftVocabulary) => {
    remove(item.id);
    const res = await setWordKnownAction(item.hanzi, true);
    if (!res.ok) {
      toast.error(res.error);
      setDraft((d) => ({ ...d, vocabulary: [...d.vocabulary, item] }));
      return;
    }
    toast.success(`« ${item.hanzi} » compté comme connu`, {
      action: {
        label: "Annuler",
        onClick: async () => {
          await setWordKnownAction(item.hanzi, false);
          setDraft((d) => ({ ...d, vocabulary: [...d.vocabulary, item] }));
        },
      },
    });
  };

  const addWord = async (word: string) => {
    const w = word.trim();
    if (!w) return;
    const existing = words.find((x) => x.hanzi === w);
    if (existing) {
      update({
        ...existing,
        decision: hasMeaning(existing) ? "approved" : existing.decision,
      });
      toast.info(`« ${w} » est déjà dans la liste.`);
      setManual("");
      return;
    }
    setAdding(true);
    const res = await buildManualWordAction(lessonId, w);
    setAdding(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    const item = {
      ...res.data,
      decision: hasMeaning(res.data) ? ("approved" as const) : ("pending" as const),
    };
    setDraft((d) => ({ ...d, vocabulary: [item, ...d.vocabulary] }));
    setManual("");
    if (!hasMeaning(item)) toast.info(`Ajoute le sens de « ${w} » (bouton « Modifier ») pour pouvoir le sélectionner.`);
  };

  const validate = () =>
    startValidate(async () => {
      const today = new Date();
      const date = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
      // Seuls les mots cochés et avec un sens sont ajoutés.
      const clean: Draft = {
        ...draft,
        vocabulary: draft.vocabulary.map((w) => (w.decision === "approved" && !hasMeaning(w) ? { ...w, decision: "pending" as const } : w)),
      };
      const res = await validateLessonAction(lessonId, clean, {
        title: title.trim() || initialTitle,
        titleChinese,
        date,
        topics: draft.lesson.topics,
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      const { created, merged } = res.data;
      toast.success(
        `${created} mot${created > 1 ? "s" : ""} ajouté${created > 1 ? "s" : ""} à tes révisions${merged ? ` (${merged} déjà connus rattachés)` : ""}.`,
      );
      router.refresh();
    });

  const rows = (list: DraftVocabulary[]) => (
    <ul className="space-y-2">
      {list.map((w) => (
        <WordRow key={w.id} item={w} onChange={update} onKnown={() => void markKnown(w)} />
      ))}
    </ul>
  );

  return (
    <div className="space-y-6 pb-24">
      {reader && (
        <VideoReader
          data={reader}
          selection={selection}
          onAdd={(w) => void addWord(w)}
          onKnown={(w) =>
            setDraft((d) => ({
              ...d,
              vocabulary: d.vocabulary.filter((x) => x.hanzi !== w),
            }))
          }
        />
      )}
      {draft.warnings.length > 0 && (
        <Alert>
          <TriangleAlert aria-hidden />
          <AlertDescription>
            <ul className="list-disc space-y-0.5 pl-4">
              {draft.warnings.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      <div className="space-y-2">
        <Label htmlFor="res-title-edit">Titre</Label>
        <Input id="res-title-edit" value={title} onChange={(e) => setTitle(e.target.value)} />
        {draft.lesson.summary && <p className="text-sm text-muted-foreground">{draft.lesson.summary}</p>}
      </div>

      <section className="space-y-3" aria-labelledby="useful-title">
        <div>
          <h2 id="useful-title" className="font-semibold">
            Mots nouveaux utiles ({useful.length})
          </h2>
          <p className="text-sm text-muted-foreground">
            Les plus fréquents et proches de ton niveau sont cochés. Coche ceux que tu veux apprendre ; « Je le connais » les retire pour de bon.
          </p>
        </div>
        {useful.length ? (
          rows(useful)
        ) : (
          <p className="text-sm text-muted-foreground">Aucun mot nouveau utile : tu connais déjà l&apos;essentiel de ce texte.</p>
        )}
      </section>

      {rare.length > 0 && (
        <section className="space-y-3">
          <button type="button" className="flex items-center gap-2 font-semibold" aria-expanded={showRare} onClick={() => setShowRare((s) => !s)}>
            <ChevronDown className={cn("size-4 transition-transform", !showRare && "-rotate-90")} aria-hidden />
            Mots rares ou avancés ({rare.length})
          </button>
          {showRare && (
            <>
              <p className="text-sm text-muted-foreground">Une seule apparition, hors liste HSK ou bien au-dessus de ton niveau : rarement prioritaires.</p>
              {rows(rare)}
            </>
          )}
        </section>
      )}

      <section className="space-y-2 rounded-xl border border-dashed p-4">
        <Label htmlFor="manual-word">Ajouter un autre mot du texte</Label>
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void addWord(manual);
          }}
        >
          <Input id="manual-word" lang="zh-CN" placeholder="Ex. 年轻人" value={manual} onChange={(e) => setManual(e.target.value)} />
          <Button type="submit" variant="outline" disabled={!manual.trim() || adding}>
            {adding ? <Loader2 className="animate-spin" aria-hidden /> : <Plus aria-hidden />} Ajouter
          </Button>
        </form>
        {presumed.length > 0 && (
          <details className="pt-2">
            <summary className="cursor-pointer text-sm text-muted-foreground">
              Mots supposés connus ({hskLevelLabel(hskLevel)} et moins) : {presumed.length} — clique sur un mot que tu ne connais pas
            </summary>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {presumed.map((p) => (
                <button
                  key={p.word}
                  type="button"
                  lang="zh-CN"
                  onClick={() => void addWord(p.word)}
                  className="rounded-full border px-2.5 py-1 font-cjk text-sm hover:border-primary hover:bg-primary/5"
                  title={`Ajouter « ${p.word} » à la sélection`}
                >
                  {p.word}
                </button>
              ))}
            </div>
          </details>
        )}
        {ownKnown.length > 0 && (
          <details className="pt-1">
            <summary className="cursor-pointer text-sm text-muted-foreground">Déjà dans tes connaissances : {ownKnown.length}</summary>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {ownKnown.map((p) => (
                <span key={p.word} lang="zh-CN" className="rounded-full bg-success-soft px-2.5 py-1 font-cjk text-sm text-success">
                  {p.word}
                </span>
              ))}
            </div>
          </details>
        )}
      </section>

      <div className="fixed inset-x-0 bottom-16 z-30 border-t bg-card/95 p-3 backdrop-blur md:bottom-0 md:left-[232px]">
        <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-between gap-2">
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="ghost" className="text-destructive" disabled={discarding || validating}>
                <Trash2 aria-hidden /> Abandonner
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Abandonner cette ressource ?</DialogTitle>
                <DialogDescription>Le texte importé et la sélection de mots seront supprimés. Tes connaissances ne sont pas touchées.</DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <DialogClose asChild>
                  <Button variant="outline">Annuler</Button>
                </DialogClose>
                <Button
                  variant="destructive"
                  onClick={() =>
                    startDiscard(async () => {
                      const res = await discardImportAction(lessonId);
                      if (!res.ok) toast.error(res.error);
                      else router.push("/ressources");
                    })
                  }
                >
                  Abandonner
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          <Button onClick={validate} disabled={validating || selected.length === 0}>
            {validating ? <Loader2 className="animate-spin" aria-hidden /> : <Check aria-hidden />}
            Ajouter {selected.length} mot{selected.length > 1 ? "s" : ""} à mes révisions
          </Button>
        </div>
      </div>
    </div>
  );
}
