import Link from "next/link";
import { BookOpen, FileUp, Loader2 } from "lucide-react";
import { prisma } from "@/lib/db/prisma";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState, formatDate, Hanzi, PageHeader } from "@/components/page";
import { LessonStatusBadge } from "@/features/lessons/status-badge";

export const dynamic = "force-dynamic";
export const metadata = { title: "Cours" };

export default async function LessonsPage() {
  const lessons = await prisma.lesson.findMany({
    where: { kind: "COURSE" },
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    include: {
      knowledge: { include: { knowledgeItem: { select: { type: true } } } },
      documents: { select: { filename: true, pageCount: true } },
      _count: { select: { corrections: true } },
    },
  });

  return (
    <div>
      <PageHeader
        title="Cours"
        description="L'historique de tes cours, du plus récent au plus ancien."
        actions={
          <Button asChild>
            <Link href="/cours/importer">
              <FileUp /> Importer un cours
            </Link>
          </Button>
        }
      />
      {lessons.length === 0 ? (
        <EmptyState
          icon={BookOpen}
          title="Aucun cours pour l'instant"
          description="Importe le PDF envoyé par ta professeure après un cours."
          action={
            <Button asChild>
              <Link href="/cours/importer">
                <FileUp /> Importer un PDF
              </Link>
            </Button>
          }
        />
      ) : (
        <ol className="space-y-3">
          {lessons.map((l) => {
            const count = (t: string[]) => l.knowledge.filter((k) => t.includes(k.knowledgeItem.type)).length;
            const processing = ["UPLOADED", "EXTRACTING", "ANALYZING"].includes(l.processingStatus);
            return (
              <li key={l.id}>
                <Link href={`/cours/${l.id}`} className="block rounded-xl focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
                  <Card className="transition hover:border-primary/40 hover:shadow-sm">
                    <CardContent className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0">
                        <p className="text-xs text-muted-foreground">{formatDate(l.date, { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</p>
                        <h2 className="truncate font-semibold">{l.title}</h2>
                        {l.titleChinese && <Hanzi className="text-sm text-muted-foreground">{l.titleChinese}</Hanzi>}
                      </div>
                      <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                        {l.processingStatus === "VALIDATED" ? (
                          <span>
                            {count(["VOCABULARY", "EXPRESSION"])} mots · {count(["GRAMMAR"])} grammaire · {count(["SENTENCE"])} phrases
                          </span>
                        ) : processing ? (
                          <span className="flex items-center gap-1">
                            <Loader2 className="size-3.5 animate-spin" aria-hidden /> Traitement…
                          </span>
                        ) : null}
                        <LessonStatusBadge status={l.processingStatus} />
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
