import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarClock, Moon, PartyPopper } from "lucide-react";
import { getPreparationBrief, getSessionSummary, getTodaySummary, ReviewError } from "@/server/review";
import { PreparationBriefCard } from "@/features/review/preparation-brief";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ResultLabel } from "@/components/badges";
import { formatRelativeDay, Stat } from "@/components/page";
import { EXERCISE_LABEL } from "@/lib/review/exercises";

export const dynamic = "force-dynamic";
export const metadata = { title: "Session terminée" };

export default async function SessionSummaryPage(props: PageProps<"/session/[id]/resume">) {
  const { id } = await props.params;
  let summary;
  try {
    summary = await getSessionSummary(id);
  } catch (err) {
    if (err instanceof ReviewError) notFound();
    throw err;
  }
  const brief = summary.kind === "PREPARATION" ? await getPreparationBrief(id) : null;
  const day = summary.kind === "DAILY" && summary.completed ? await getTodaySummary() : null;
  const rate = summary.reviews ? Math.round((summary.correct / summary.reviews) * 100) : 0;
  const minutes = Math.max(1, Math.round(summary.durationSeconds / 60));
  const toReview = summary.items.filter((i) => i.result === "INCORRECT" || i.result === "MOSTLY_CORRECT");

  return (
    <div className="mx-auto w-full max-w-xl px-4 py-10">
      <div className="mb-8 text-center motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2 motion-safe:duration-500">
        <span className="mx-auto mb-3 flex size-14 items-center justify-center rounded-full bg-success-soft text-success">
          <PartyPopper className="size-7" aria-hidden />
        </span>
        <h1 className="text-2xl font-semibold">Session terminée</h1>
        <p className="text-muted-foreground">Tes résultats sont enregistrés et tes prochaines révisions planifiées.</p>
        {summary.remaining > 0 && (
          <p className="mt-2 text-sm text-muted-foreground">
            Arrêtée avant la fin : {summary.remaining > 1 ? `les ${summary.remaining} exercices restants reviendront` : "l'exercice restant reviendra"} dans tes
            prochaines sessions.
          </p>
        )}
      </div>

      <div className="mb-6 grid grid-cols-3 gap-3">
        <Stat value={summary.reviews} label="exercices" />
        <Stat value={`${rate} %`} label="réussis" />
        <Stat value={`${minutes} min`} label="de travail" />
      </div>

      {day && (
        <Card className="mb-4 border-primary/30 bg-primary/5">
          <CardContent className="flex gap-3">
            <Moon className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden />
            <div className="space-y-1 text-sm">
              <h2 className="font-semibold">C&apos;est bon pour aujourd&apos;hui</h2>
              <p>
                {day.tomorrow.reviews + day.tomorrow.newItems > 0 ? (
                  <>
                    Reviens demain : ~{day.tomorrow.reviews} révision{day.tomorrow.reviews > 1 ? "s" : ""}
                    {day.tomorrow.newItems > 0 && <> et {day.tomorrow.newItems} nouveauté{day.tomorrow.newItems > 1 ? "s" : ""}</>} (≈ {day.tomorrow.minutes} min).
                  </>
                ) : (
                  <>Rien de prévu pour demain pour l&apos;instant.</>
                )}
              </p>
              <p className="text-muted-foreground">
                {day.due > 0
                  ? `Il reste ${day.due} révision${day.due > 1 ? "s" : ""} due${day.due > 1 ? "s" : ""} : tu peux continuer depuis l'accueil (sans nouveautés), ou t'arrêter là.`
                  : "Mieux vaut revenir demain que prolonger : c'est la régularité qui fait mémoriser."}
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {brief && (
        <div className="mb-4">
          <PreparationBriefCard brief={brief} />
        </div>
      )}

      {toReview.length > 0 && (
        <Card className="mb-4">
          <CardContent>
            <h2 className="mb-3 text-sm font-semibold">À revoir bientôt ({toReview.length})</h2>
            <ul className="divide-y">
              {toReview.map((i) => (
                <li key={i.knowledgeItemId} className="flex items-center justify-between gap-3 py-2">
                  <Link href={`/connaissances/${i.knowledgeItemId}`} lang="zh-CN" className="font-cjk text-lg hover:underline">
                    {i.label}
                  </Link>
                  <ResultLabel result={i.result} />
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <Card className="mb-8">
        <CardContent>
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold">
            <CalendarClock className="size-4" aria-hidden /> Prochaines révisions
          </h2>
          <ul className="max-h-72 divide-y overflow-auto text-sm">
            {summary.items.map((i) => (
              <li key={i.knowledgeItemId} className="flex items-center justify-between gap-3 py-2">
                <span className="min-w-0 truncate">
                  <span lang="zh-CN" className="font-cjk">{i.label}</span>
                  <span className="ml-2 text-xs text-muted-foreground">{EXERCISE_LABEL[i.exerciseType]}</span>
                </span>
                <span className="shrink-0 text-muted-foreground">{formatRelativeDay(i.nextReviewAt)}</span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <div className="flex flex-col gap-2 sm:flex-row">
        <Button asChild size="lg" className="h-12 flex-1">
          <Link href="/">Retour à l&apos;accueil</Link>
        </Button>
        {summary.mistakes > 0 && (
          <Button asChild size="lg" variant="outline" className="h-12 flex-1">
            <Link href="/erreurs">Voir mes erreurs</Link>
          </Button>
        )}
      </div>
    </div>
  );
}
