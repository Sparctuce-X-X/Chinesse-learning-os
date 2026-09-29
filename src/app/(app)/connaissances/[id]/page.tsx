import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Play } from "lucide-react";
import { getKnowledgeDetail } from "@/server/knowledge";
import { startSessionFormAction } from "@/app/actions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MasteryBadge, ProvenanceBadge, ResultLabel, TYPE_LABEL } from "@/components/badges";
import { formatDate, formatRelativeDay } from "@/components/page";
import { SubmitButton } from "@/components/submit-button";
import { SpeakButton } from "@/components/speak-button";
import { masteryOf, scoreLabel } from "@/lib/review/mastery";
import { EXERCISE_LABEL, type ExerciseType } from "@/lib/review/exercises";
import { CATEGORY_LABEL } from "@/server/mistakes";
import { KnowledgeEditor } from "@/features/knowledge/knowledge-editor";
import { ItemThemes } from "@/features/themes/item-themes";
import { listThemeOptions } from "@/server/themes";

export const dynamic = "force-dynamic";

export async function generateMetadata(props: PageProps<"/connaissances/[id]">) {
  const { id } = await props.params;
  const d = await getKnowledgeDetail(id);
  const k = d?.item;
  return { title: k?.vocabulary?.hanzi ?? k?.sentence?.hanzi ?? k?.grammarPoint?.name ?? "Connaissance" };
}

export default async function KnowledgeDetailPage(props: PageProps<"/connaissances/[id]">) {
  const { id } = await props.params;
  const detail = await getKnowledgeDetail(id);
  if (!detail) notFound();
  const { item, firstLesson, attemptsByDimension } = detail;
  const themeOptions = item.type === "GRAMMAR" ? [] : await listThemeOptions();
  const v = item.vocabulary;
  const s = item.sentence;
  const g = item.grammarPoint;
  const st = item.reviewState;
  const activeMistakes = item.mistakes.filter((m) => !m.resolvedAt);
  const level = masteryOf(st, activeMistakes);
  const primary = v?.hanzi ?? s?.hanzi ?? g?.name ?? "";
  const audio = v?.hanzi ?? s?.hanzi ?? null;
  const dims: { label: string; score: number; key: string }[] = [
    { label: "Reconnaissance", score: st?.recognitionScore ?? 0, key: "RECOGNITION" },
    { label: "Production", score: st?.productionScore ?? 0, key: "PRODUCTION" },
    { label: "Écoute", score: st?.listeningScore ?? 0, key: "LISTENING" },
    { label: "Prononciation", score: st?.pronunciationScore ?? 0, key: "PRONUNCIATION" },
    { label: "Usage", score: st?.usageScore ?? 0, key: "USAGE" },
  ];

  return (
    <div className="space-y-6">
      <Link href="/connaissances" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden /> Connaissances
      </Link>

      <header className="rounded-2xl border bg-card p-6">
        <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span>{TYPE_LABEL[item.type]}</span>
          <MasteryBadge level={level} />
          <ProvenanceBadge source={item.sourceType} />
          {item.status === "SUSPENDED" && <span className="rounded-full bg-muted px-2 py-0.5">Suspendue</span>}
        </div>
        <h1 lang="zh-CN" className={item.type === "SENTENCE" ? "text-2xl sm:text-3xl" : "font-hanzi text-5xl sm:text-6xl"}>
          {primary}
        </h1>
        {(v?.pinyin || s?.pinyin) && (
          <p className="mt-2 flex items-center gap-2 text-xl text-muted-foreground">
            {v?.pinyin ?? s?.pinyin} <ProvenanceBadge source={v?.pinyinSource ?? s?.pinyinSource} compact />
          </p>
        )}
        {g?.structure && <p className="mt-2 text-lg text-muted-foreground">{g.structure}</p>}
        <div className="mt-3 space-y-1">
          {(v?.french || s?.french || g?.french) && (
            <p className="flex flex-wrap items-center gap-2 text-lg">
              {v?.french ?? s?.french ?? g?.french} <ProvenanceBadge source={v?.frenchSource ?? s?.frenchSource ?? g?.frenchSource} />
            </p>
          )}
          {(v?.english || s?.english) && (
            <p className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              Anglais : {v?.english ?? s?.english} <ProvenanceBadge source={v?.englishSource ?? s?.englishSource} compact />
            </p>
          )}
          {g?.explanation && (
            <p className="flex flex-wrap items-center gap-2 text-sm">
              {g.explanation} <ProvenanceBadge source={g.explanationSource} compact />
            </p>
          )}
          {(v?.notes || s?.notes || g?.notes) && <p className="text-sm text-muted-foreground">{v?.notes ?? s?.notes ?? g?.notes}</p>}
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {audio && <SpeakButton text={audio} showSlow />}
          <form action={startSessionFormAction}>
            <input type="hidden" name="kind" value="KNOWLEDGE" />
            <input type="hidden" name="knowledgeItemId" value={item.id} />
            <SubmitButton variant="secondary" pendingLabel="Préparation…">
              <Play /> Retravailler
            </SubmitButton>
          </form>
          <KnowledgeEditor
            id={item.id}
            type={item.type}
            suspended={item.status === "SUSPENDED"}
            initial={{
              hanzi: v?.hanzi ?? s?.hanzi ?? "",
              pinyin: v?.pinyin ?? s?.pinyin ?? "",
              french: v?.french ?? s?.french ?? g?.french ?? "",
              english: v?.english ?? s?.english ?? "",
              notes: v?.notes ?? s?.notes ?? g?.notes ?? "",
              name: g?.name ?? "",
              structure: g?.structure ?? "",
              explanation: g?.explanation ?? "",
            }}
          />
        </div>
      </header>

      <div className="grid gap-4 md:grid-cols-2">
        {item.type !== "GRAMMAR" && (
          <Card className="md:col-span-2">
            <CardHeader>
              <CardTitle className="text-base">Thèmes</CardTitle>
            </CardHeader>
            <CardContent>
              <ItemThemes
                knowledgeItemId={item.id}
                themes={item.themes.map((t) => ({ ...t.theme, source: t.source }))}
                options={themeOptions}
              />
            </CardContent>
          </Card>
        )}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Origine</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {item.lessons.length === 0 && <p className="text-muted-foreground">Ajoutée manuellement.</p>}
            {item.lessons.map((l) => (
              <div key={l.id} className="flex items-start justify-between gap-2">
                <div>
                  <Link href={`/${l.lesson.kind === "RESOURCE" ? "ressources" : "cours"}/${l.lesson.id}`} className="font-medium hover:underline">
                    {l.lesson.title}
                  </Link>
                  <p className="text-muted-foreground">
                    {l.lesson.kind === "RESOURCE" ? "Ressource externe · " : ""}
                    {formatDate(l.lesson.date)}
                    {l.sourcePage ? ` · page ${l.sourcePage}` : ""}
                  </p>
                  {l.sourceText && (
                    <p lang="zh-CN" className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                      « {l.sourceText} »
                    </p>
                  )}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Progression</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="space-y-2 text-sm">
              {dims.map((d) => (
                <div key={d.key} className="flex items-center gap-3">
                  <dt className="w-28 shrink-0 text-muted-foreground">{d.label}</dt>
                  <dd className="flex flex-1 items-center gap-2">
                    <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted" aria-hidden>
                      <span className="block h-full rounded-full bg-primary" style={{ width: `${d.score}%` }} />
                    </span>
                    <span className="w-28 text-right text-xs">{scoreLabel(d.score, attemptsByDimension[d.key] ?? 0)}</span>
                  </dd>
                </div>
              ))}
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Historique</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-2 gap-y-2 text-sm">
              <dt className="text-muted-foreground">Première apparition</dt>
              <dd>{firstLesson ? formatDate(firstLesson.lesson.date) : formatDate(item.createdAt)}</dd>
              <dt className="text-muted-foreground">Dernière révision</dt>
              <dd>{st?.lastReviewAt ? formatDate(st.lastReviewAt) : "Jamais"}</dd>
              <dt className="text-muted-foreground">Prochaine révision</dt>
              <dd>{st?.nextReviewAt ? formatRelativeDay(st.nextReviewAt) : st?.reps ? "—" : "À découvrir"}</dd>
              <dt className="text-muted-foreground">Intervalle</dt>
              <dd>{st?.intervalDays ? `${Math.round(st.intervalDays)} j` : "—"}</dd>
              <dt className="text-muted-foreground">Erreurs</dt>
              <dd>{item.mistakes.reduce((n, m) => n + m.occurrences, 0)}</dd>
            </dl>
          </CardContent>
        </Card>

        {item.examples.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Exemples</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {item.examples.map((e) => (
                <div key={e.id} className="flex items-start justify-between gap-2">
                  <div>
                    <p lang="zh-CN" className="text-lg">{e.hanzi}</p>
                    {e.pinyin && <p className="text-sm text-muted-foreground">{e.pinyin}</p>}
                    {(e.french || e.english) && (
                      <p className="flex flex-wrap items-center gap-1.5 text-sm">
                        {e.french ?? e.english} <ProvenanceBadge source={e.translationSource} compact />
                      </p>
                    )}
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <SpeakButton text={e.hanzi} size="icon-sm" label="Écouter l'exemple" />
                    <ProvenanceBadge source={e.sourceType} compact />
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </div>

      {item.mistakes.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Erreurs</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="divide-y text-sm">
              {item.mistakes.map((m) => (
                <li key={m.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <span>
                    <strong>{CATEGORY_LABEL[m.category]}</strong> · {m.occurrences} fois · ta réponse : <span lang="zh-CN">{m.userAnswer}</span>
                  </span>
                  <span className="text-xs text-muted-foreground">{m.resolvedAt ? "Résolue" : `Dernière : ${formatRelativeDay(m.lastSeenAt)}`}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Dernières réponses</CardTitle>
        </CardHeader>
        <CardContent>
          {item.attempts.length === 0 ? (
            <p className="text-sm text-muted-foreground">Pas encore révisée.</p>
          ) : (
            <ul className="divide-y text-sm">
              {item.attempts.map((a) => (
                <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <span className="min-w-0">
                    <span className="text-muted-foreground">{EXERCISE_LABEL[a.exerciseType as ExerciseType]}</span> ·{" "}
                    <span lang="zh-CN">{a.userAnswer || "—"}</span>
                  </span>
                  <span className="flex items-center gap-3">
                    <ResultLabel result={a.result} />
                    <span className="text-xs text-muted-foreground">{formatDate(a.createdAt, { day: "numeric", month: "short" })}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
