import Link from "next/link";
import { CircleAlert, GraduationCap, Play } from "lucide-react";
import { getTodaySummary } from "@/server/review";
import { startSessionFormAction } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/page";
import { SubmitButton } from "@/components/submit-button";

export const dynamic = "force-dynamic";
export const metadata = { title: "Réviser" };

export default async function ReviewPage() {
  const s = await getTodaySummary();
  return (
    <div>
      <PageHeader title="Réviser" description="L'application choisit pour toi ce qu'il faut revoir." />
      <div className="space-y-3">
        <Card className="border-primary/25">
          <CardContent className="space-y-4">
            <div className="flex items-start gap-3">
              <Play className="mt-1 size-5 text-primary" aria-hidden />
              <div>
                <h2 className="font-semibold">Session du jour</h2>
                <p className="text-sm text-muted-foreground">
                  {s.inProgressSessionId
                    ? `Session en cours : encore ${s.inProgressRemaining} exercice(s).`
                    : s.dayDone
                      ? `Journée validée ✓ Reviens demain${s.tomorrow.minutes ? ` (≈ ${s.tomorrow.minutes} min)` : ""}.${s.due ? ` Encore ${s.due} révision(s) due(s) si tu veux continuer, sans nouveautés.` : ""}`
                      : s.plannedCount
                        ? `${s.plannedCount} exercices · environ ${s.estimatedMinutes} min`
                        : "Aucune révision due pour le moment."}
                </p>
              </div>
            </div>
            {s.inProgressSessionId ? (
              <Button asChild size="lg" className="h-12 w-full text-base">
                <Link href={`/session/${s.inProgressSessionId}`}>Reprendre ma session</Link>
              </Button>
            ) : s.dayDone ? (
              s.due > 0 && (
                <form action={startSessionFormAction}>
                  <input type="hidden" name="kind" value="DAILY" />
                  <input type="hidden" name="reviewsOnly" value="1" />
                  <SubmitButton variant="outline" className="w-full" pendingLabel="Préparation…">
                    Encore un peu (révisions seulement)
                  </SubmitButton>
                </form>
              )
            ) : (
              <form action={startSessionFormAction}>
                <input type="hidden" name="kind" value="DAILY" />
                <SubmitButton size="lg" className="h-12 w-full text-base" disabled={!s.plannedCount} pendingLabel="Préparation…">
                  Commencer ma session
                </SubmitButton>
              </form>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center justify-between gap-3">
            <div className="flex items-start gap-3">
              <CircleAlert className="mt-1 size-5 text-destructive" aria-hidden />
              <div>
                <h2 className="font-semibold">Retravailler mes erreurs</h2>
                <p className="text-sm text-muted-foreground">{s.activeMistakes} erreur(s) active(s)</p>
              </div>
            </div>
            <form action={startSessionFormAction}>
              <input type="hidden" name="kind" value="MISTAKES" />
              <SubmitButton variant="outline" disabled={!s.activeMistakes} pendingLabel="…">
                Lancer
              </SubmitButton>
            </form>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center justify-between gap-3">
            <div className="flex items-start gap-3">
              <GraduationCap className="mt-1 size-5 text-teacher" aria-hidden />
              <div>
                <h2 className="font-semibold">Préparer mon prochain cours</h2>
                <p className="text-sm text-muted-foreground">Dernier cours, points fragiles et erreurs récurrentes.</p>
              </div>
            </div>
            <form action={startSessionFormAction}>
              <input type="hidden" name="kind" value="PREPARATION" />
              <SubmitButton variant="outline" disabled={!s.totalKnowledge} pendingLabel="…">
                Lancer
              </SubmitButton>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
