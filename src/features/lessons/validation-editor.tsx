"use client";

import { useEffect, useId, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, CheckCheck, FileText, Highlighter, Link2, Loader2, Pencil, Plus, RotateCcw, Trash2, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { saveDraftAction, validateLessonAction } from "@/app/actions";
import type { Draft, DraftSection } from "@/lib/ai/schemas";
import { approveAll, draftCounts, draftId } from "@/lib/lessons/draft";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ConfidenceBadge, ProvenanceBadge } from "@/components/badges";
import { cn } from "@/lib/utils";

type AnyItem = Draft[DraftSection][number] & Record<string, unknown>;
type Prov = "TEACHER" | "AI" | "USER" | "EXTERNAL";

interface FieldDef {
  key: string;
  label: string;
  sourceKey?: string;
  chinese?: boolean;
  multiline?: boolean;
  required?: boolean;
}

const FIELDS: Record<DraftSection, FieldDef[]> = {
  vocabulary: [
    { key: "hanzi", label: "Chinois", chinese: true, required: true },
    { key: "pinyin", label: "Pinyin", sourceKey: "pinyinSource" },
    { key: "french", label: "Français", sourceKey: "frenchSource" },
    { key: "english", label: "Anglais", sourceKey: "englishSource" },
    { key: "notes", label: "Notes", multiline: true },
  ],
  grammarPoints: [
    { key: "name", label: "Structure", chinese: true, required: true },
    { key: "structure", label: "Schéma" },
    { key: "explanation", label: "Explication", sourceKey: "explanationSource", multiline: true },
    { key: "french", label: "Sens en français", sourceKey: "frenchSource" },
  ],
  sentences: [
    { key: "hanzi", label: "Chinois", chinese: true, required: true },
    { key: "pinyin", label: "Pinyin", sourceKey: "pinyinSource" },
    { key: "french", label: "Français", sourceKey: "frenchSource" },
    { key: "english", label: "Anglais", sourceKey: "englishSource" },
  ],
  corrections: [
    { key: "incorrect", label: "Forme incorrecte", chinese: true, required: true },
    { key: "correct", label: "Forme correcte", chinese: true, required: true },
    { key: "explanation", label: "Explication", sourceKey: "explanationSource", multiline: true },
    { key: "context", label: "Contexte" },
  ],
  exercises: [
    { key: "prompt", label: "Consigne", chinese: true, required: true, multiline: true },
    { key: "answer", label: "Réponse" },
    { key: "context", label: "Contexte" },
  ],
};

const SECTION_LABEL: Record<DraftSection, string> = {
  vocabulary: "Vocabulaire",
  grammarPoints: "Grammaire",
  sentences: "Phrases",
  corrections: "Corrections",
  exercises: "Exercices",
};

const ORIGIN_LABEL: Record<string, string> = {
  TEACHER_MATERIAL: "Support de cours",
  TEACHER_NOTE: "Note de la professeure",
  DIALOGUE: "Dialogue",
  STUDENT_PRACTICE: "Phrase de l'élève",
};

const EXERCISE_TYPE_LABEL: Record<string, string> = {
  DISCUSSION: "Discussion",
  COMPREHENSION: "Compréhension",
  FILL_BLANK: "Texte à trou",
  TRANSLATION: "Traduction",
  OTHER: "Autre",
};

function newItem(section: DraftSection): AnyItem {
  const meta = { id: draftId("u"), decision: "approved" as const, edited: true, duplicate: null };
  switch (section) {
    case "vocabulary":
      return { ...meta, kind: "VOCABULARY", hanzi: "", pinyin: null, pinyinSource: "USER", french: null, frenchSource: "USER", english: null, englishSource: null, partOfSpeech: null, notes: null, examples: [], sourcePage: null, sourceText: null, confidence: "HIGH", highlighted: false } as unknown as AnyItem;
    case "grammarPoints":
      return { ...meta, name: "", structure: null, explanation: null, explanationSource: "USER", french: null, frenchSource: "USER", examples: [], sourcePage: null, sourceText: null, confidence: "HIGH" } as unknown as AnyItem;
    case "sentences":
      return { ...meta, hanzi: "", pinyin: null, pinyinSource: "USER", french: null, frenchSource: "USER", english: null, englishSource: null, origin: "TEACHER_NOTE", sourcePage: null, confidence: "HIGH" } as unknown as AnyItem;
    case "corrections":
      return { ...meta, incorrect: "", correct: "", explanation: null, explanationSource: "USER", context: null, sourcePage: null, confidence: "HIGH" } as unknown as AnyItem;
    case "exercises":
      return { ...meta, type: "OTHER", prompt: "", answer: null, context: null, sourcePage: null } as unknown as AnyItem;
  }
}

export interface LessonMeta {
  title: string;
  titleChinese: string;
  date: string;
  topics: string;
}

export function ValidationEditor({
  lessonId,
  initialDraft,
  initialMeta,
  method,
  pageCount,
  imagePages,
}: {
  lessonId: string;
  initialDraft: Draft;
  initialMeta: LessonMeta;
  method: string | null;
  pageCount: number;
  imagePages: number[];
}) {
  const router = useRouter();
  const [draft, setDraft] = useState<Draft>(initialDraft);
  const [meta, setMeta] = useState<LessonMeta>(initialMeta);
  const [onlyUncertain, setOnlyUncertain] = useState(false);
  const [editing, setEditing] = useState<Set<string>>(new Set());
  const [saveState, setSaveState] = useState<"saved" | "saving" | "error">("saved");
  const [validating, startValidate] = useTransition();
  const [lastSaved, setLastSaved] = useState(() => JSON.stringify(initialDraft));
  const serializedDraft = useMemo(() => JSON.stringify(draft), [draft]);

  // Sauvegarde automatique du brouillon (les corrections ne sont jamais perdues).
  useEffect(() => {
    if (serializedDraft === lastSaved) return;
    const t = setTimeout(async () => {
      setSaveState("saving");
      const res = await saveDraftAction(lessonId, JSON.parse(serializedDraft) as Draft);
      if (res.ok) setLastSaved(serializedDraft);
      setSaveState(res.ok ? "saved" : "error");
    }, 800);
    return () => clearTimeout(t);
  }, [serializedDraft, lastSaved, lessonId]);

  const dirty = saveState !== "saving" && serializedDraft !== lastSaved;

  const counts = useMemo(() => draftCounts(draft), [draft]);

  const update = (section: DraftSection, id: string, patch: Record<string, unknown>) => {
    setDraft((d) => ({
      ...d,
      [section]: (d[section] as AnyItem[]).map((it) => (it.id === id ? { ...it, ...patch } : it)),
    }));
  };

  const setField = (section: DraftSection, item: AnyItem, f: FieldDef, value: string) => {
    const patch: Record<string, unknown> = { [f.key]: value === "" && !f.required ? null : value, edited: true };
    if (f.sourceKey) patch[f.sourceKey] = value ? "USER" : null;
    update(section, item.id, patch);
  };

  const toggleEdit = (id: string) =>
    setEditing((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const add = (section: DraftSection) => {
    const item = newItem(section);
    setDraft((d) => ({ ...d, [section]: [item, ...(d[section] as AnyItem[])] }));
    setEditing((s) => new Set(s).add(item.id));
  };

  const validate = () => {
    if (!meta.title.trim()) {
      toast.error("Indique un titre pour le cours.");
      return;
    }
    const invalid = (Object.keys(FIELDS) as DraftSection[]).some((s) =>
      (draft[s] as AnyItem[]).some((it) => it.decision === "approved" && FIELDS[s].some((f) => f.required && !String(it[f.key] ?? "").trim())),
    );
    if (invalid) {
      toast.error("Certains éléments approuvés ont un champ obligatoire vide.");
      return;
    }
    startValidate(async () => {
      const res = await validateLessonAction(lessonId, draft, {
        title: meta.title,
        titleChinese: meta.titleChinese || null,
        date: meta.date,
        topics: meta.topics.split(",").map((t) => t.trim()).filter(Boolean),
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      const s = res.data;
      toast.success(`Cours validé : ${s.created} nouvelle(s) connaissance(s)${s.merged ? `, ${s.merged} déjà connue(s) rattachée(s)` : ""}.`);
      router.push(`/cours/${lessonId}`);
    });
  };

  return (
    <div className="pb-32">
      <div className="mb-6 grid gap-4 rounded-2xl border bg-card p-4 sm:grid-cols-2 sm:p-6">
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="lesson-title">Titre du cours</Label>
          <Input id="lesson-title" value={meta.title} onChange={(e) => setMeta({ ...meta, title: e.target.value })} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="lesson-title-zh">Titre chinois</Label>
          <Input id="lesson-title-zh" lang="zh-CN" value={meta.titleChinese} onChange={(e) => setMeta({ ...meta, titleChinese: e.target.value })} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="lesson-date">Date du cours</Label>
          <Input id="lesson-date" type="date" value={meta.date} onChange={(e) => setMeta({ ...meta, date: e.target.value })} />
          <p className="text-xs text-muted-foreground">Proposée d&apos;après le fichier : vérifie-la.</p>
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="lesson-topics">Thèmes (séparés par des virgules)</Label>
          <Input id="lesson-topics" value={meta.topics} onChange={(e) => setMeta({ ...meta, topics: e.target.value })} />
        </div>
        <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground sm:col-span-2">
          <span>{method === "AI" ? "Analysé par l'IA" : method === "HEURISTIC" ? "Extraction simple (sans IA)" : ""}</span>
          <span>· {pageCount} pages</span>
          <a href={`/api/lessons/${lessonId}/pdf`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">
            <FileText className="size-3.5" aria-hidden /> Ouvrir le PDF
          </a>
          {imagePages.length > 0 && <span>· pages images : {imagePages.join(", ")}</span>}
        </div>
      </div>

      {draft.warnings.length > 0 && (
        <Alert className="mb-6">
          <TriangleAlert aria-hidden />
          <AlertDescription>
            <ul className="list-disc space-y-1 pl-4">
              {draft.warnings.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={onlyUncertain} onChange={(e) => setOnlyUncertain(e.target.checked)} className="size-4 accent-[var(--primary)]" />
          Afficher seulement les éléments incertains ({counts.lowConfidence})
        </label>
      </div>

      <Tabs defaultValue="vocabulary">
        <TabsList className="mb-4 h-auto w-full flex-wrap justify-start">
          {(Object.keys(FIELDS) as DraftSection[]).map((s) => {
            const items = draft[s] as AnyItem[];
            return (
              <TabsTrigger key={s} value={s} className="flex-none">
                {SECTION_LABEL[s]} <span className="ml-1 text-muted-foreground tabular-nums">{items.filter((i) => i.decision !== "rejected").length}</span>
              </TabsTrigger>
            );
          })}
        </TabsList>

        {(Object.keys(FIELDS) as DraftSection[]).map((section) => {
          const items = (draft[section] as AnyItem[]).filter((i) => !onlyUncertain || i.confidence === "LOW");
          return (
            <TabsContent key={section} value={section} className="space-y-3">
              <Button variant="outline" size="sm" onClick={() => add(section)}>
                <Plus /> Ajouter
              </Button>
              {items.length === 0 && (
                <p className="rounded-xl border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
                  {onlyUncertain ? "Aucun élément incertain dans cette section." : "Rien d'extrait dans cette section. Tu peux ajouter des éléments manuellement."}
                </p>
              )}
              {items.map((item) => (
                <ItemCard
                  key={item.id}
                  section={section}
                  item={item}
                  editing={editing.has(item.id)}
                  onToggleEdit={() => toggleEdit(item.id)}
                  onField={(f, v) => setField(section, item, f, v)}
                  onPatch={(patch) => update(section, item.id, patch)}
                />
              ))}
            </TabsContent>
          );
        })}
      </Tabs>

      <div className="fixed inset-x-0 bottom-16 z-30 border-t bg-card/95 px-4 py-3 backdrop-blur md:bottom-0 md:left-[232px]">
        <div className="mx-auto flex max-w-5xl flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm" aria-live="polite">
            <strong className="text-success">{counts.approved}</strong> approuvés · <strong>{counts.pending}</strong> en attente ·{" "}
            <span className="text-muted-foreground">{counts.rejected} supprimés</span>
            <span className="ml-2 text-xs text-muted-foreground">
              {saveState === "saving" ? "Enregistrement…" : saveState === "error" ? "Échec de l'enregistrement" : dirty ? "Modifications…" : "Brouillon enregistré"}
            </span>
          </p>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setDraft((d) => approveAll(d))} disabled={counts.pending === 0 || validating}>
              <CheckCheck /> Tout approuver
            </Button>
            <Button onClick={validate} disabled={counts.approved === 0 || validating}>
              {validating ? <Loader2 className="animate-spin" aria-hidden /> : <Check />}
              Valider le cours ({counts.approved})
            </Button>
          </div>
        </div>
        {counts.pending > 0 && counts.approved > 0 && (
          <p className="mx-auto mt-1 max-w-5xl text-xs text-muted-foreground">Seuls les éléments approuvés seront ajoutés à ta base.</p>
        )}
      </div>
    </div>
  );
}

function ItemCard({
  section,
  item,
  editing,
  onToggleEdit,
  onField,
  onPatch,
}: {
  section: DraftSection;
  item: AnyItem;
  editing: boolean;
  onToggleEdit: () => void;
  onField: (f: FieldDef, value: string) => void;
  onPatch: (patch: Record<string, unknown>) => void;
}) {
  const fields = FIELDS[section];
  const [primary, ...rest] = fields;
  const rejected = item.decision === "rejected";
  const approved = item.decision === "approved";
  const low = item.confidence === "LOW";
  const examples =
    (item.examples as { hanzi: string; french: string | null; english: string | null; source: Prov; translationSource?: Prov | null }[] | undefined) ?? [];
  const duplicate = item.duplicate as { knowledgeItemId: string; label: string; action: "merge" | "new" } | null;

  if (rejected) {
    return (
      <div className="flex items-center justify-between rounded-xl border border-dashed px-4 py-2 text-sm text-muted-foreground">
        <span className="truncate line-through" lang="zh-CN">
          {String(item[primary.key] ?? "")}
        </span>
        <Button variant="ghost" size="sm" onClick={() => onPatch({ decision: "pending" })}>
          <RotateCcw /> Restaurer
        </Button>
      </div>
    );
  }

  return (
    <article
      className={cn(
        "rounded-xl border bg-card p-4 transition",
        low && "border-l-4 border-l-warning",
        approved && "border-success/40 bg-success-soft/20",
      )}
      aria-label={String(item[primary.key] ?? "Nouvel élément")}
    >
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          {editing ? (
            <FieldInput field={primary} value={item[primary.key] as string | null} onChange={(v) => onField(primary, v)} />
          ) : (
            <p lang={primary.chinese ? "zh-CN" : undefined} className={cn(primary.chinese ? "font-hanzi text-2xl" : "text-base font-medium", "break-words")}>
              {String(item[primary.key] ?? "") || <span className="text-muted-foreground italic">vide</span>}
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {"confidence" in item && item.confidence ? <ConfidenceBadge level={item.confidence as "HIGH" | "MEDIUM" | "LOW"} /> : null}
          {item.sourcePage ? <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">p. {String(item.sourcePage)}</span> : null}
          {item.highlighted ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-warning-soft px-2 py-0.5 text-[11px] text-warning">
              <Highlighter className="size-3" aria-hidden /> Surligné
            </span>
          ) : null}
          {"origin" in item && item.origin ? (
            <span className={cn("rounded-full px-2 py-0.5 text-[11px]", item.origin === "STUDENT_PRACTICE" ? "bg-user-soft text-user" : "bg-muted text-muted-foreground")}>
              {ORIGIN_LABEL[item.origin as string]}
            </span>
          ) : null}
          {section === "exercises" && <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">{EXERCISE_TYPE_LABEL[item.type as string]}</span>}
          {item.edited ? <ProvenanceBadge source="USER" /> : null}
        </div>
      </div>

      {editing ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {section === "vocabulary" && (
            <SelectField
              label="Type"
              value={item.kind as string}
              options={{ VOCABULARY: "Mot", EXPRESSION: "Expression" }}
              onChange={(v) => onPatch({ kind: v, edited: true })}
            />
          )}
          {section === "sentences" && (
            <SelectField label="Origine" value={item.origin as string} options={ORIGIN_LABEL} onChange={(v) => onPatch({ origin: v, edited: true })} />
          )}
          {section === "exercises" && (
            <SelectField label="Type" value={item.type as string} options={EXERCISE_TYPE_LABEL} onChange={(v) => onPatch({ type: v, edited: true })} />
          )}
          {rest.map((f) => (
            <div key={f.key} className={cn(f.multiline && "sm:col-span-2")}>
              <FieldInput field={f} value={item[f.key] as string | null} onChange={(v) => onField(f, v)} source={f.sourceKey ? (item[f.sourceKey] as Prov | null) : undefined} />
            </div>
          ))}
        </div>
      ) : (
        <dl className="grid gap-x-6 gap-y-1.5 text-sm sm:grid-cols-[max-content_1fr]">
          {rest.map((f) => {
            const v = item[f.key] as string | null;
            if (!v) return null;
            return (
              <div key={f.key} className="contents">
                <dt className="text-muted-foreground">{f.label}</dt>
                <dd className="flex flex-wrap items-center gap-2">
                  <span lang={f.chinese ? "zh-CN" : undefined} className="whitespace-pre-line">
                    {v}
                  </span>
                  {f.sourceKey && <ProvenanceBadge source={item[f.sourceKey] as Prov | null} />}
                </dd>
              </div>
            );
          })}
        </dl>
      )}

      {examples.length > 0 && (
        <div className="mt-3 space-y-1 border-t pt-3">
          <p className="text-xs font-medium text-muted-foreground">Exemples</p>
          {examples.map((ex, i) => (
            <div key={i} className="flex items-start justify-between gap-2 text-sm">
              <p className="flex flex-wrap items-center gap-1.5">
                <span lang="zh-CN">{ex.hanzi}</span>
                <ProvenanceBadge source={ex.source} compact />
                {(ex.french || ex.english) && (
                  <>
                    <span className="text-muted-foreground">— {ex.french ?? ex.english}</span>
                    <ProvenanceBadge source={ex.translationSource ?? (ex.source === "TEACHER" ? "AI" : ex.source)} compact />
                  </>
                )}
              </p>
              {editing && (
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Retirer cet exemple"
                  onClick={() => onPatch({ examples: examples.filter((_, j) => j !== i), edited: true })}
                >
                  <Trash2 />
                </Button>
              )}
            </div>
          ))}
        </div>
      )}

      {duplicate && (
        <div className="mt-3 flex flex-col gap-2 rounded-lg bg-muted/70 px-3 py-2 text-sm sm:flex-row sm:items-center sm:justify-between">
          <p className="flex items-center gap-2">
            <Link2 className="size-4 shrink-0 text-muted-foreground" aria-hidden />
            <span>
              Déjà dans ta base : <span lang="zh-CN">{duplicate.label}</span>
            </span>
          </p>
          <div className="flex gap-1" role="radiogroup" aria-label="Que faire de ce doublon ?">
            <Button
              size="xs"
              variant={duplicate.action === "merge" ? "default" : "outline"}
              role="radio"
              aria-checked={duplicate.action === "merge"}
              onClick={() => onPatch({ duplicate: { ...duplicate, action: "merge" } })}
            >
              Rattacher
            </Button>
            <Button
              size="xs"
              variant={duplicate.action === "new" ? "default" : "outline"}
              role="radio"
              aria-checked={duplicate.action === "new"}
              onClick={() => onPatch({ duplicate: { ...duplicate, action: "new" } })}
            >
              Créer séparément
            </Button>
          </div>
        </div>
      )}

      <div className="mt-3 flex flex-wrap justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onToggleEdit}>
          <Pencil /> {editing ? "Terminer" : "Modifier"}
        </Button>
        <Button variant="ghost" size="sm" className="text-destructive" onClick={() => onPatch({ decision: "rejected" })}>
          <Trash2 /> Supprimer
        </Button>
        <Button variant={approved ? "secondary" : "outline"} size="sm" onClick={() => onPatch({ decision: approved ? "pending" : "approved" })} aria-pressed={approved}>
          <Check className={cn(approved && "text-success")} /> {approved ? "Approuvé" : "Approuver"}
        </Button>
      </div>
    </article>
  );
}

function FieldInput({ field, value, onChange, source }: { field: FieldDef; value: string | null; onChange: (v: string) => void; source?: Prov | null }) {
  const id = useId();
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2">
        <Label htmlFor={id} className="text-xs text-muted-foreground">
          {field.label}
          {field.required && " *"}
        </Label>
        {source && <ProvenanceBadge source={source} />}
      </div>
      {field.multiline ? (
        <Textarea id={id} lang={field.chinese ? "zh-CN" : undefined} value={value ?? ""} onChange={(e) => onChange(e.target.value)} rows={2} />
      ) : (
        <Input id={id} lang={field.chinese ? "zh-CN" : undefined} value={value ?? ""} onChange={(e) => onChange(e.target.value)} className={cn(field.chinese && "text-lg")} />
      )}
    </div>
  );
}

function SelectField({ label, value, options, onChange }: { label: string; value: string; options: Record<string, string>; onChange: (v: string) => void }) {
  const id = useId();
  return (
    <div className="space-y-1">
      <Label htmlFor={id} className="text-xs text-muted-foreground">
        {label}
      </Label>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 w-full rounded-lg border border-input bg-transparent px-2 text-sm focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        {Object.entries(options).map(([k, v]) => (
          <option key={k} value={k}>
            {v}
          </option>
        ))}
      </select>
    </div>
  );
}
