import Link from "next/link";
import { CircleCheck, Play } from "lucide-react";
import { listMistakes, mistakeCounts, CATEGORY_LABEL, RECURRING_THRESHOLD, type MistakeSection } from "@/server/mistakes";
import { startSessionFormAction } from "@/app/actions";
import { EmptyState, formatRelativeDay, PageHeader } from "@/components/page";
import { SubmitButton } from "@/components/submit-button";
import { EXERCISE_LABEL, type ExerciseType } from "@/lib/review/exercises";
import { MistakeActions } from "@/features/mistakes/mistake-actions";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const metadata = { title: "Mes erreurs" };

const SECTIONS: { value: MistakeSection; label: string }[] = [
  { value: "todo", label: "À retravailler" },
  { value: "recurring", label: "Récurrentes" },
  { value: "recent", label: "Récentes" },
  { value: "resolved", label: "Résolues" },
];

export default async function MistakesPage(props: PageProps<"/erreurs">) {
  const sp = (await props.searchParams) as { section?: string };
  const section = (SECTIONS.find((s) => s.value === sp.section)?.value ?? "todo") as MistakeSection;
  const [mistakes, counts] = await Promise.all([listMistakes(section), mistakeCounts()]);

  return (
    <div>
      <PageHeader
        title="Mes erreurs"
        description="Chaque erreur est enregistrée et revient en priorité dans tes sessions."
        actions={
          counts.todo > 0 ? (
            <form action={startSessionFormAction}>
              <input type="hidden" name="kind" value="MISTAKES" />
              <SubmitButton pendingLabel="Préparation…">
                <Play /> Retravailler mes erreurs
              </SubmitButton>
            </form>
          ) : null
        }
      />
      <nav aria-label="Sections" className="-mx-4 mb-5 flex gap-2 overflow-x-auto px-4 pb-1">
        {SECTIONS.map((s) => (
          <Link
            key={s.value}
            href={s.value === "todo" ? "/erreurs" : `/erreurs?section=${s.value}`}
            aria-current={section === s.value ? "page" : undefined}
            className={cn(
              "shrink-0 rounded-full border px-3 py-1.5 text-sm transition",
              section === s.value ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:border-primary/40",
            )}
          >
            {s.label} <span className="tabular-nums opacity-70">{counts[s.value]}</span>
          </Link>
        ))}
      </nav>

      {mistakes.length === 0 ? (
        <EmptyState
          icon={CircleCheck}
          title={section === "resolved" ? "Aucune erreur résolue pour l'instant" : "Aucune erreur ici"}
          description={section === "todo" ? "Tes erreurs apparaîtront ici après tes sessions de révision." : undefined}
        />
      ) : (
        <ul className="space-y-3">
          {mistakes.map((m) => {
            const k = m.knowledgeItem;
            const label = k.vocabulary?.hanzi ?? k.sentence?.hanzi ?? k.grammarPoint?.name ?? "?";
            const pinyin = k.vocabulary?.pinyin ?? k.sentence?.pinyin;
            const recurring = !m.resolvedAt && m.occurrences >= RECURRING_THRESHOLD;
            return (
              <li key={m.id} className={cn("rounded-xl border bg-card p-4", recurring && "border-l-4 border-l-destructive")}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="mb-1 flex flex-wrap items-center gap-2 text-xs">
                      {recurring && <span className="rounded-full bg-danger-soft px-2 py-0.5 font-medium text-destructive">Erreur récurrente</span>}
                      <span className="rounded-full bg-muted px-2 py-0.5 text-muted-foreground">{CATEGORY_LABEL[m.category]}</span>
                      <span className="text-muted-foreground">{EXERCISE_LABEL[m.exerciseType as ExerciseType]}</span>
                    </div>
                    <Link href={`/connaissances/${k.id}`} lang="zh-CN" className="font-hanzi text-2xl hover:underline">
                      {label}
                    </Link>
                    {pinyin && <span className="ml-2 text-muted-foreground">{pinyin}</span>}
                  </div>
                  <div className="text-right text-xs text-muted-foreground">
                    <p>
                      <strong className="text-base text-foreground tabular-nums">{m.occurrences}</strong> occurrence{m.occurrences > 1 ? "s" : ""}
                    </p>
                    <p>Dernière : {formatRelativeDay(m.lastSeenAt)}</p>
                    {m.resolvedAt && <p>Résolue {formatRelativeDay(m.resolvedAt)}</p>}
                    {m.reopenedCount > 0 && <p>Revenue {m.reopenedCount} fois</p>}
                  </div>
                </div>
                <dl className="mt-3 grid gap-1 text-sm sm:grid-cols-[max-content_1fr] sm:gap-x-4">
                  <dt className="text-muted-foreground">Question</dt>
                  <dd>{m.prompt}</dd>
                  <dt className="text-muted-foreground">Ta réponse</dt>
                  <dd lang="zh-CN" className="text-destructive">
                    ✗ {m.userAnswer || "—"}
                  </dd>
                  <dt className="text-muted-foreground">Réponse attendue</dt>
                  <dd lang="zh-CN" className="text-success">
                    ✓ {m.expectedAnswer}
                  </dd>
                  {m.explanation && (
                    <>
                      <dt className="text-muted-foreground">Explication</dt>
                      <dd>{m.explanation}</dd>
                    </>
                  )}
                </dl>
                <MistakeActions mistakeId={m.id} knowledgeItemId={k.id} resolved={!!m.resolvedAt} />
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
