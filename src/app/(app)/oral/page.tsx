import Link from "next/link";
import { Mic } from "lucide-react";
import { getAIStatus } from "@/lib/ai";
import { getSpeakingPrompts, recentSpeakingAttempts } from "@/server/speaking";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { EmptyState, formatRelativeDay, PageHeader } from "@/components/page";
import { SpeakingPractice } from "@/features/speaking/speaking-practice";
import { ResultLabel } from "@/components/badges";

export const dynamic = "force-dynamic";
export const metadata = { title: "Oral" };

export default async function SpeakingPage() {
  const [prompts, ai, recent] = await Promise.all([getSpeakingPrompts(), getAIStatus(), recentSpeakingAttempts(8)]);
  return (
    <div className="space-y-6">
      <PageHeader
        title="Oral"
        description="Réponds à voix haute avec ce que tu as appris récemment. Au plus 3 corrections par réponse."
        actions={
          <Button asChild variant="outline">
            <Link href="/conversation">Conversation IA</Link>
          </Button>
        }
      />
      {!ai.available && (
        <Alert>
          <AlertDescription>
            L&apos;IA est indisponible ({(ai.reason ?? "non configurée").replace(/\.$/, "")}). Tu peux t&apos;entraîner et enregistrer tes réponses, mais sans correction automatique.
          </AlertDescription>
        </Alert>
      )}
      {prompts.length === 0 ? (
        <EmptyState
          icon={Mic}
          title="Pas encore d'exercice d'oral"
          description="Les exercices sont construits à partir de tes cours validés : questions de la professeure, vocabulaire récent et points faibles."
          action={
            <Button asChild>
              <Link href="/cours/importer">Importer un cours</Link>
            </Button>
          }
        />
      ) : (
        <SpeakingPractice prompts={prompts} aiAvailable={ai.available} />
      )}
      {recent.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-semibold">Mes dernières réponses</h2>
          <ul className="divide-y rounded-xl border bg-card text-sm">
            {recent.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2">
                <span className="min-w-0 flex-1">
                  <span lang="zh-CN" className="block truncate">{a.transcription}</span>
                  <span lang="zh-CN" className="block truncate text-xs text-muted-foreground">{a.prompt}</span>
                </span>
                <span className="flex items-center gap-3">
                  {a.audioPath && <audio controls preload="none" src={`/api/audio/${a.id}`} className="h-8 w-40" aria-label="Réécouter" />}
                  {a.result ? <ResultLabel result={a.result} /> : <span className="text-xs text-muted-foreground">non évaluée</span>}
                  <span className="text-xs text-muted-foreground">{formatRelativeDay(a.createdAt)}</span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
