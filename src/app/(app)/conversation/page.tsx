import Link from "next/link";
import { getAIStatus } from "@/lib/ai";
import { listConversations, SCENARIOS } from "@/server/conversation";
import { prisma } from "@/lib/db/prisma";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { formatRelativeDay, PageHeader } from "@/components/page";
import { ScenarioPicker } from "@/features/conversation/scenario-picker";

export const dynamic = "force-dynamic";
export const metadata = { title: "Conversation IA" };

export default async function ConversationsPage() {
  const [ai, conversations, knowledge] = await Promise.all([getAIStatus(), listConversations(), prisma.knowledgeItem.count({ where: { status: "ACTIVE" } })]);
  return (
    <div className="space-y-6">
      <PageHeader
        title="Conversation IA"
        description="De courtes mises en situation qui te font réutiliser naturellement ton vocabulaire récent, tes points faibles et ta grammaire."
      />
      {!ai.available ? (
        <Alert>
          <AlertDescription>
            La conversation nécessite l&apos;IA : {(ai.reason ?? "non configurée").replace(/\.$/, "")}. Configure-la dans les{" "}
            <Link href="/parametres" className="underline">
              paramètres
            </Link>
            .
          </AlertDescription>
        </Alert>
      ) : knowledge === 0 ? (
        <Alert>
          <AlertDescription>Importe et valide un cours d&apos;abord : la conversation s&apos;appuie sur ce que tu as appris.</AlertDescription>
        </Alert>
      ) : null}
      <ScenarioPicker scenarios={SCENARIOS} disabled={!ai.available || knowledge === 0} />
      {conversations.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-semibold">Conversations précédentes</h2>
          <ul className="divide-y rounded-xl border bg-card text-sm">
            {conversations.map((c) => (
              <li key={c.id}>
                <Link href={`/conversation/${c.id}`} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-muted/50">
                  <span>
                    <span className="font-medium">{c.title}</span>
                    <span className="ml-2 text-muted-foreground">{c.scenario}</span>
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {c._count.turns} messages · {c.completedAt ? "terminée" : "en cours"} · {formatRelativeDay(c.createdAt)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
