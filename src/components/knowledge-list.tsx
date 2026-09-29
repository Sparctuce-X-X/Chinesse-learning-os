import Link from "next/link";
import type { KnowledgeListItem } from "@/server/knowledge";
import { formatRelativeDay } from "@/components/page";
import { MasteryBadge, ProvenanceBadge, TYPE_LABEL } from "@/components/badges";
import { cn } from "@/lib/utils";

/** Liste de connaissances (page Connaissances, thèmes). `aside` : contenu ajouté en bout de ligne. */
export function KnowledgeList({ items, aside }: { items: KnowledgeListItem[]; aside?: (k: KnowledgeListItem) => React.ReactNode }) {
  return (
    <ul className="divide-y rounded-xl border bg-card">
      {items.map((k) => (
        <li key={k.id} className="flex items-center">
          <Link
            href={`/connaissances/${k.id}`}
            className="flex min-w-0 flex-1 items-center gap-4 px-4 py-3 transition hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:outline-none"
          >
            <div className="min-w-0 flex-1">
              <p lang="zh-CN" className={cn("truncate", k.type === "SENTENCE" ? "text-base" : "font-hanzi text-xl")}>
                {k.primary}
              </p>
              <p className="truncate text-sm text-muted-foreground">
                {k.pinyin && <span className="mr-2">{k.pinyin}</span>}
                {k.meaning}
                {k.meaningIsEnglish && <span className="text-xs"> (en)</span>}
              </p>
            </div>
            <div className="hidden shrink-0 flex-col items-end gap-1 text-xs text-muted-foreground sm:flex">
              <span>{TYPE_LABEL[k.type]}</span>
              <span>{k.nextReviewAt ? `Révision ${formatRelativeDay(k.nextReviewAt)}` : "Pas encore révisé"}</span>
            </div>
            <div className="flex shrink-0 flex-col items-end gap-1">
              <MasteryBadge level={k.mastery} />
              <ProvenanceBadge source={k.sourceType} compact />
            </div>
          </Link>
          {aside && <div className="shrink-0 pr-2">{aside(k)}</div>}
        </li>
      ))}
    </ul>
  );
}
