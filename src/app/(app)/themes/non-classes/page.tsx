import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { listUnthemedIds } from "@/server/themes";
import { listKnowledgeByIds } from "@/server/knowledge";
import { getAIStatus } from "@/lib/ai";
import { PageHeader } from "@/components/page";
import { KnowledgeList } from "@/components/knowledge-list";
import { RetryUnthemedButton } from "@/features/themes/retry-unthemed-button";

export const dynamic = "force-dynamic";
export const metadata = { title: "Non classés" };

export default async function UnthemedPage() {
  const [items, ai] = await Promise.all([listUnthemedIds().then(listKnowledgeByIds), getAIStatus()]);
  return (
    <div className="space-y-4">
      <Link href="/themes" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden /> Thèmes
      </Link>
      <PageHeader
        title="Non classés"
        description="Éléments sans thème. Ouvre un élément pour le ranger à la main, ou relance le rangement automatique."
        actions={ai.available && items.length > 0 ? <RetryUnthemedButton /> : undefined}
      />
      {items.length === 0 ? (
        <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">Tous tes éléments ont un thème.</p>
      ) : (
        <KnowledgeList items={items} />
      )}
    </div>
  );
}
