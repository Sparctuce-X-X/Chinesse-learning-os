import Link from "next/link";
import { ArrowRight, BookOpen, CircleAlert, FileUp, GraduationCap, Mic, Sparkles, MessagesSquare } from "lucide-react";
import { prisma } from "@/lib/db/prisma";
import { getTodaySummary } from "@/server/review";
import { getUser } from "@/server/user";
import { getSpeakingPrompts } from "@/server/speaking";
import { startSessionFormAction } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { EmptyState, formatDate, Hanzi } from "@/components/page";
import { SubmitButton } from "@/components/submit-button";

export const dynamic = "force-dynamic";

function greeting(name: string) {
  const h = new Date().getHours();
  const hello = h < 5 ? "Bonsoir" : h < 18 ? "Bonjour" : "Bonsoir";
  return name && name !== "Moi" ? `${hello} ${name}` : hello;
}

export default async function TodayPage(props: PageProps<"/">) {
  const { message } = (await props.searchParams) as { message?: string };
  const [user, summary, lastLesson, pending, speaking] = await Promise.all([
    getUser(),
    getTodaySummary(),
    prisma.lesson.findFirst({
      where: { kind: "COURSE", processingStatus: "VALIDATED" },
      orderBy: { date: "desc" },
      include: { knowledge: { include: { knowledgeItem: { select: { type: true } } } } },
    }),
    prisma.lesson.findMany({
      where: { processingStatus: { in: ["READY_FOR_REVIEW", "ANALYZING", "EXTRACTING"] } },
      orderBy: { createdAt: "desc" },
      take: 3,
    }),
    getSpeakingPrompts(3),
  ]);

  const countType = (t: string) => lastLesson?.knowledge.filter((k) => k.knowledgeItem.type === t).length ?? 0;
  const hasKnowledge = summary.totalKnowledge > 0;
  const newCapReached = summary.newRemaining === 0 && summary.newPerDay > 0 && summary.newAvailable > 0 && summary.plannedNew === 0;

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-muted-foreground">{formatDate(new Date(), { weekday: "long", day: "numeric", month: "long" })}</p>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{greeting(user.name)} 👋</h1>
      </div>

      {message && (
        <Alert>
          <AlertDescription>{message}</AlertDescription>
        </Alert>
      )}

      {pending.length > 0 && (
        <Card className="border-warning/40 bg-warning-soft/50">
          <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-sm">
              <p className="font-medium">
                {pending.length === 1
                  ? pending[0].kind === "RESOURCE"
                    ? "Une ressource attend ta validation"
                    : "Un cours attend ta validation"
                  : `${pending.length} imports attendent ta validation`}
              </p>
              <p className="text-muted-foreground">{pending.map((l) => l.title).join(" · ")}</p>
            </div>
            <Button asChild variant="outline">
              <Link href={`${pending[0].kind === "RESOURCE" ? "/ressources" : "/cours"}/${pending[0].id}`}>
                Vérifier l&apos;extraction <ArrowRight />
              </Link>
            </Button>
          </CardContent>
        </Card>
      )}

      {!hasKnowledge ? (
        <EmptyState
          icon={FileUp}
          title="Commence par importer un cours"
          description="Dépose le PDF de ton dernier cours : l'application en extrait le vocabulaire, les phrases et la grammaire, puis compose tes révisions."
          action={
            <Button asChild size="lg" className="h-11 px-5">
              <Link href="/cours/importer">
                <FileUp /> Importer un PDF
              </Link>
            </Button>
          }
        />
      ) : (
        <Card className="overflow-hidden border-primary/20">
          <CardContent className="p-0">
            <div className="grid gap-6 p-6 sm:grid-cols-[1fr_auto] sm:items-center sm:p-8">
              <div>
                <h2 className="text-sm font-medium text-muted-foreground">Aujourd&apos;hui</h2>
                {summary.inProgressSessionId ? (
                  <>
                    <p className="mt-1 text-3xl font-semibold tracking-tight">Session en cours</p>
                    <p className="mt-2 text-sm text-muted-foreground">
                      Encore {summary.inProgressRemaining} exercice{summary.inProgressRemaining > 1 ? "s" : ""}
                    </p>
                  </>
                ) : summary.dayDone ? (
                  <>
                    <p className="mt-1 text-3xl font-semibold tracking-tight">Journée validée ✓</p>
                    <p className="mt-2 text-sm">
                      {summary.today.minutes > 0 && <>{summary.today.minutes} min · </>}
                      {summary.today.reviews} exercice{summary.today.reviews > 1 ? "s" : ""}
                      {summary.today.reviews > 0 && <> · {Math.round((summary.today.correct / summary.today.reviews) * 100)} % réussis</>}
                      {" · "}
                      {summary.today.newLearned} nouvelle{summary.today.newLearned > 1 ? "s" : ""} notion{summary.today.newLearned > 1 ? "s" : ""}
                    </p>
                    <p className="mt-3 text-sm">
                      {summary.tomorrow.reviews + summary.tomorrow.newItems > 0 ? (
                        <>
                          Reviens demain : <strong className="tabular-nums">~{summary.tomorrow.reviews}</strong> révision{summary.tomorrow.reviews > 1 ? "s" : ""}
                          {summary.tomorrow.newItems > 0 && (
                            <>
                              {" "}
                              et <strong className="tabular-nums">{summary.tomorrow.newItems}</strong> nouveauté{summary.tomorrow.newItems > 1 ? "s" : ""}
                            </>
                          )}{" "}
                          t&apos;attendent (≈ {summary.tomorrow.minutes} min).
                        </>
                      ) : (
                        <>Rien de prévu pour demain pour l&apos;instant.</>
                      )}
                    </p>
                    <p className="mt-2 text-sm text-muted-foreground">
                      Tu peux t&apos;arrêter là : c&apos;est la régularité qui fait mémoriser. L&apos;oral et les conversations restent libres, ils n&apos;alourdissent
                      pas tes révisions.
                    </p>
                  </>
                ) : summary.plannedCount > 0 ? (
                  <>
                    <p className="mt-1 text-4xl font-semibold tracking-tight tabular-nums">
                      {summary.estimatedMinutes} min <span className="text-xl font-normal text-muted-foreground">de chinois</span>
                    </p>
                    <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm">
                      <li>
                        <strong className="tabular-nums">{summary.plannedCount - summary.plannedNew}</strong> révision{summary.plannedCount - summary.plannedNew > 1 ? "s" : ""}
                      </li>
                      <li>
                        <strong className="tabular-nums">{summary.plannedNew}</strong> notion{summary.plannedNew > 1 ? "s" : ""} récente{summary.plannedNew > 1 ? "s" : ""}
                      </li>
                      {speaking.length > 0 && (
                        <li>
                          <Link href="/oral" className="hover:underline">
                            <strong className="tabular-nums">{speaking.length}</strong> exercice{speaking.length > 1 ? "s" : ""} d&apos;oral
                          </Link>
                        </li>
                      )}
                      {summary.recurringMistakes > 0 && (
                        <li className="text-destructive">
                          <strong className="tabular-nums">{summary.recurringMistakes}</strong> erreur{summary.recurringMistakes > 1 ? "s" : ""} récurrente{summary.recurringMistakes > 1 ? "s" : ""}
                        </li>
                      )}
                    </ul>
                    {newCapReached && (
                      <p className="mt-2 text-xs text-muted-foreground">
                        Plafond de {summary.newPerDay} nouvelles notions atteint aujourd&apos;hui : les suivantes arriveront demain.
                      </p>
                    )}
                  </>
                ) : (
                  <>
                    <p className="mt-1 text-3xl font-semibold tracking-tight">Tout est à jour ✓</p>
                    <p className="mt-2 text-sm text-muted-foreground">
                      {newCapReached
                        ? `Plafond de ${summary.newPerDay} nouvelles notions atteint aujourd'hui : les suivantes arriveront demain. `
                        : "Aucune révision due. "}
                      Tu peux préparer ton prochain cours ou pratiquer l&apos;oral.
                    </p>
                  </>
                )}
              </div>
              {summary.inProgressSessionId ? (
                <Button asChild size="lg" className="h-12 px-6 text-base">
                  <Link href={`/session/${summary.inProgressSessionId}`}>Reprendre ma session</Link>
                </Button>
              ) : summary.dayDone ? (
                summary.due > 0 ? (
                  <form action={startSessionFormAction} className="flex flex-col items-stretch gap-1 sm:items-end">
                    <input type="hidden" name="kind" value="DAILY" />
                    <input type="hidden" name="reviewsOnly" value="1" />
                    <SubmitButton variant="outline" className="w-full sm:w-auto" pendingLabel="Préparation…">
                      Encore un peu (révisions seulement)
                    </SubmitButton>
                    <span className="text-center text-xs text-muted-foreground sm:text-right">
                      {summary.due} révision{summary.due > 1 ? "s" : ""} encore due{summary.due > 1 ? "s" : ""} · aucune nouveauté
                    </span>
                  </form>
                ) : null
              ) : summary.plannedCount > 0 ? (
                <form action={startSessionFormAction}>
                  <input type="hidden" name="kind" value="DAILY" />
                  <SubmitButton size="lg" className="h-12 w-full px-6 text-base sm:w-auto" pendingLabel="Préparation…">
                    Commencer ma session
                  </SubmitButton>
                </form>
              ) : null}
            </div>
          </CardContent>
        </Card>
      )}

      {hasKnowledge && (
        <div className="grid gap-4 md:grid-cols-2">
          {lastLesson && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <BookOpen className="size-4 text-muted-foreground" aria-hidden /> Dernier cours
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <p className="font-medium">{lastLesson.title}</p>
                  {lastLesson.titleChinese && <Hanzi className="text-sm text-muted-foreground">{lastLesson.titleChinese}</Hanzi>}
                  <p className="text-sm text-muted-foreground">{formatDate(lastLesson.date)}</p>
                </div>
                <p className="text-sm">
                  {countType("VOCABULARY") + countType("EXPRESSION")} mots · {countType("GRAMMAR")} structures · {countType("SENTENCE")} phrases
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button asChild variant="outline" size="sm">
                    <Link href={`/cours/${lastLesson.id}`}>Voir le cours</Link>
                  </Button>
                  <form action={startSessionFormAction}>
                    <input type="hidden" name="kind" value="PREPARATION" />
                    <SubmitButton variant="secondary" size="sm" pendingLabel="Préparation…">
                      <GraduationCap /> Préparer mon prochain cours
                    </SubmitButton>
                  </form>
                </div>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <CircleAlert className="size-4 text-muted-foreground" aria-hidden /> À retravailler
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {summary.activeMistakes > 0 ? (
                <>
                  <p className="text-sm">
                    <strong>{summary.activeMistakes}</strong> erreur{summary.activeMistakes > 1 ? "s" : ""} active{summary.activeMistakes > 1 ? "s" : ""}
                    {summary.recurringMistakes > 0 && <> dont <strong>{summary.recurringMistakes}</strong> récurrente{summary.recurringMistakes > 1 ? "s" : ""}</>}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <Button asChild variant="outline" size="sm">
                      <Link href="/erreurs">Voir mes erreurs</Link>
                    </Button>
                    <form action={startSessionFormAction}>
                      <input type="hidden" name="kind" value="MISTAKES" />
                      <SubmitButton variant="secondary" size="sm" pendingLabel="Préparation…">
                        Retravailler
                      </SubmitButton>
                    </form>
                  </div>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">Aucune erreur active. Elles apparaîtront ici après tes sessions.</p>
              )}
            </CardContent>
          </Card>

          <Card className="md:col-span-2">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Sparkles className="size-4 text-muted-foreground" aria-hidden /> Pratiquer l&apos;oral
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              <Button asChild variant="outline">
                <Link href="/oral">
                  <Mic /> Exercices d&apos;oral
                </Link>
              </Button>
              <Button asChild variant="outline">
                <Link href="/conversation">
                  <MessagesSquare /> Conversation IA
                </Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
