import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, FileText, Link2 } from "lucide-react";
import { prisma } from "@/lib/db/prisma";
import { getAIStatus } from "@/lib/ai";
import { getDraft, isAnalysisRunning, recoverStaleAnalyses } from "@/server/lessons";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { formatDate, Hanzi, PageHeader } from "@/components/page";
import { LessonStatusBadge } from "@/features/lessons/status-badge";
import { AnalysisProgress } from "@/features/lessons/analysis-progress";
import { ValidationEditor } from "@/features/lessons/validation-editor";
import { FailedImport } from "@/features/lessons/failed-import";
import { LessonDetail } from "@/features/lessons/lesson-detail";

export const dynamic = "force-dynamic";

export async function generateMetadata(props: PageProps<"/cours/[id]">) {
  const { id } = await props.params;
  const lesson = await prisma.lesson.findUnique({ where: { id }, select: { title: true } });
  return { title: lesson?.title ?? "Cours" };
}

export default async function LessonPage(props: PageProps<"/cours/[id]">) {
  const { id } = await props.params;
  const { doublon } = (await props.searchParams) as { doublon?: string };
  await recoverStaleAnalyses();
  const lesson = await prisma.lesson.findUnique({
    where: { id },
    include: { documents: { select: { pageCount: true, imagePages: true, filename: true } } },
  });
  if (!lesson) notFound();
  if (lesson.kind === "RESOURCE") redirect(`/ressources/${lesson.id}`);
  const doc = lesson.documents[0];
  const imagePages = (doc?.imagePages as number[] | null) ?? [];
  const processing = ["UPLOADED", "EXTRACTING", "ANALYZING"].includes(lesson.processingStatus);

  const header = (
    <>
      <Link href="/cours" className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden /> Tous les cours
      </Link>
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-3">
            {lesson.title} <LessonStatusBadge status={lesson.processingStatus} />
          </span>
        }
        description={
          <>
            {lesson.titleChinese && <Hanzi className="mr-2">{lesson.titleChinese}</Hanzi>}
            {formatDate(lesson.date, { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
          </>
        }
        actions={
          doc ? (
            <Button asChild variant="outline" size="sm">
              <a href={`/api/lessons/${lesson.id}/pdf`} target="_blank" rel="noreferrer">
                <FileText /> Voir le PDF
              </a>
            </Button>
          ) : null
        }
      />
    </>
  );

  if (processing) {
    const ai = await getAIStatus();
    return (
      <div>
        {header}
        {doublon && <DuplicateNotice title={doublon} />}
        <AnalysisProgress lessonId={lesson.id} aiLabel={ai.available ? ai.label.split(" — ")[0] : null} startedAt={lesson.updatedAt.toISOString()} />
        {!isAnalysisRunning(lesson.id) && lesson.processingStatus === "ANALYZING" && (
          <p className="mx-auto mt-4 max-w-lg text-center text-xs text-muted-foreground">
            Si l&apos;analyse ne progresse pas, elle sera marquée comme interrompue après 15 minutes et tu pourras la relancer.
          </p>
        )}
      </div>
    );
  }

  if (lesson.processingStatus === "FAILED") {
    const ai = await getAIStatus();
    return (
      <div>
        {header}
        <FailedImport lessonId={lesson.id} error={lesson.analysisError} canRetryExtraction={!!doc && doc.pageCount > 0} aiAvailable={ai.available} />
      </div>
    );
  }

  if (lesson.processingStatus === "READY_FOR_REVIEW") {
    const draft = await getDraft(lesson.id);
    if (!draft) {
      return (
        <div>
          {header}
          <FailedImport lessonId={lesson.id} error="Le brouillon d'extraction est illisible. Relance l'analyse." canRetryExtraction aiAvailable />
        </div>
      );
    }
    return (
      <div>
        {header}
        {doublon && <DuplicateNotice title={doublon} />}
        <p className="mb-4 text-sm text-muted-foreground">
          Vérifie l&apos;extraction : corrige, supprime ou approuve chaque élément. Rien n&apos;est ajouté à ta base avant la validation.
        </p>
        <ValidationEditor
          lessonId={lesson.id}
          initialDraft={draft}
          initialMeta={{
            title: lesson.title,
            titleChinese: lesson.titleChinese ?? "",
            date: lesson.date.toISOString().slice(0, 10),
            topics: ((lesson.topics as string[] | null) ?? []).join(", "),
          }}
          method={lesson.extractionMethod}
          pageCount={doc?.pageCount ?? 0}
          imagePages={imagePages}
        />
      </div>
    );
  }

  return (
    <div>
      {header}
      <LessonDetail lessonId={lesson.id} />
    </div>
  );
}

function DuplicateNotice({ title }: { title: string }) {
  return (
    <Alert className="mb-4">
      <Link2 aria-hidden />
      <AlertDescription>
        Ce PDF a déjà été importé (« {title} »). Les connaissances déjà présentes seront rattachées, pas dupliquées.
      </AlertDescription>
    </Alert>
  );
}
