import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getConversation } from "@/server/conversation";
import { ConversationChat } from "@/features/conversation/conversation-chat";
import type { SpeakingFeedback } from "@/lib/ai/schemas";

export const dynamic = "force-dynamic";
export const metadata = { title: "Conversation" };

export default async function ConversationPage(props: PageProps<"/conversation/[id]">) {
  const { id } = await props.params;
  const conv = await getConversation(id);
  if (!conv) notFound();
  return (
    <div className="space-y-4">
      <Link href="/conversation" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden /> Conversations
      </Link>
      <ConversationChat
        id={conv.id}
        title={conv.title}
        situation={conv.setupData?.situationFr ?? conv.scenario}
        role={conv.setupData?.roleFr ?? null}
        targets={conv.targetsData}
        completed={!!conv.completedAt}
        summary={conv.summaryData}
        turns={conv.turns.map((t) => ({
          id: t.id,
          role: t.role,
          hanzi: t.hanzi,
          pinyin: t.pinyin,
          french: t.french,
          feedback: (t.feedback as Partial<SpeakingFeedback> | null) ?? null,
        }))}
      />
    </div>
  );
}
