import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, ExternalLink, Link2, Play } from "lucide-react";
import { prisma } from "@/lib/db/prisma";
import { getAIStatus } from "@/lib/ai";
import { getDraft, recoverStaleAnalyses } from "@/server/lessons";
import { getReaderData, getResourceAnalysis, whisperMaxSeconds } from "@/server/resources";
import { listKnowledgeByIds } from "@/server/knowledge";
import { startSessionFormAction } from "@/app/actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDate, Hanzi, PageHeader } from "@/components/page";
import { formatTime } from "@/lib/resources/video";
import { SubmitButton } from "@/components/submit-button";
import { KnowledgeList } from "@/components/knowledge-list";
import { LessonStatusBadge } from "@/features/lessons/status-badge";
import { FailedImport } from "@/features/lessons/failed-import";
import { CoverageMeter } from "@/features/resources/coverage-meter";
import { HskLevelSelect } from "@/features/resources/hsk-level-select";
import { MoreWordsButton } from "@/features/resources/more-words-button";
import { ResourceProgress } from "@/features/resources/resource-progress";
import { ResourceTriage } from "@/features/resources/resource-triage";
import { VideoReader } from "@/features/resources/video-reader";

export const dynamic = "force-dynamic";

const KIND_LABEL = {
  ARTICLE: "Article",
  TEXT: "Texte",
  DOCUMENT: "Document",
  VIDEO: "Vidéo YouTube",
} as const;
const TRANSCRIPT_LABEL = {
  CAPTIONS: "sous-titres de l'auteur",
  AUTO_CAPTIONS: "sous-titres automatiques de YouTube",
  WHISPER: "transcription Whisper",
} as const;

export async function generateMetadata(props: PageProps<"/ressources/[id]">) {
  const { id } = await props.params;
  const lesson = await prisma.lesson.findUnique({
    where: { id },
    select: { title: true },
  });
  return { title: lesson?.title ?? "Ressource" };
}

export default async function ResourcePage(props: PageProps<"/ressources/[id]">) {
  const { id } = await props.params;
  const { doublon } = (await props.searchParams) as { doublon?: string };
  await recoverStaleAnalyses();
  const lesson = await prisma.lesson.findUnique({ where: { id } });
  if (!lesson) notFound();
  if (lesson.kind !== "RESOURCE") redirect(`/cours/${id}`);
  const data = await getResourceAnalysis(id);
  if (!data) notFound();
  const { resource, analysis, hskLevel } = data;
  const processing = ["UPLOADED", "EXTRACTING", "ANALYZING"].includes(lesson.processingStatus);

  const header = (
    <>
      <Link href="/ressources" className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden /> Toutes les ressources
      </Link>
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-3">
            {lesson.title} <LessonStatusBadge status={lesson.processingStatus} resource />
          </span>
        }
        description={
          <>
            {lesson.titleChinese && lesson.titleChinese !== lesson.title && <Hanzi className="mr-2">{lesson.titleChinese}</Hanzi>}
            {KIND_LABEL[resource.kind]}
            {resource.siteName ? ` · ${resource.siteName}` : resource.filename ? ` · ${resource.filename}` : ""}
            {resource.durationSec ? ` · ${formatTime(resource.durationSec)}` : ""}
            {resource.transcriptSource && resource.text ? ` · ${TRANSCRIPT_LABEL[resource.transcriptSource]}` : ""} · ajouté le{" "}
            {formatDate(resource.createdAt, {
              day: "numeric",
              month: "long",
              year: "numeric",
            })}
          </>
        }
        actions={
          resource.url ? (
            <a
              href={resource.url}
              target="_blank"
              rel="noreferrer noopener"
              className="inline-flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md border px-3 text-sm font-medium hover:bg-muted"
            >
              <ExternalLink className="size-4" aria-hidden /> Ouvrir la source
            </a>
          ) : null
        }
      />
      {doublon && (
        <Alert className="mb-4">
          <Link2 aria-hidden />
          <AlertDescription>Ce contenu a déjà été importé (« {doublon} »). Les mots déjà ajoutés sont reconnus comme connus.</AlertDescription>
        </Alert>
      )}
    </>
  );

  if (processing) {
    const ai = await getAIStatus();
    return (
      <div>
        {header}
        <ResourceProgress
          lessonId={id}
          aiLabel={ai.available ? ai.label.split(" — ")[0] : null}
          startedAt={lesson.updatedAt.toISOString()}
          whisper={
            resource.transcriptSource === "WHISPER" && !resource.text
              ? {
                  seconds: resource.durationSec ? Math.min(resource.durationSec, whisperMaxSeconds()) : null,
                  initialStatus: lesson.processingStatus,
                }
              : null
          }
        />
      </div>
    );
  }

  if (lesson.processingStatus === "FAILED") {
    const ai = await getAIStatus();
    return (
      <div>
        {header}
        <FailedImport lessonId={id} error={lesson.analysisError} canRetryExtraction aiAvailable={ai.available} resource />
      </div>
    );
  }

  const draft = await getDraft(id);
  const reader = resource.kind === "VIDEO" ? await getReaderData(id, draft) : null;
  const coverage = (
    <Card>
      <CardContent className="space-y-4">
        <CoverageMeter stats={analysis.stats} hskLevel={hskLevel} />
        <div className="flex flex-wrap items-center gap-3 border-t pt-3">
          <HskLevelSelect level={hskLevel} />
          {lesson.processingStatus === "READY_FOR_REVIEW" && (
            <span className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              Niveau changé ? <MoreWordsButton lessonId={id} label="Recalculer la liste" />
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );

  if (lesson.processingStatus === "READY_FOR_REVIEW") {
    if (!draft) {
      return (
        <div>
          {header}
          <FailedImport lessonId={id} error="La sélection de mots est illisible. Relance l'analyse." canRetryExtraction aiAvailable resource />
        </div>
      );
    }
    const chip = (w: (typeof analysis.words)[number]) => ({
      word: w.word,
      count: w.count,
      hsk: w.hsk?.level ?? null,
    });
    return (
      <div className="space-y-6">
        <div>{header}</div>
        {coverage}
        <p className="text-sm text-muted-foreground">
          Choisis les mots à apprendre. Rien n&apos;est ajouté à tes révisions avant de valider ; les mots viennent de la ressource (jamais de ta professeure),
          les sens et pinyin sont proposés par l&apos;IA ou le dictionnaire HSK.
        </p>
        <ResourceTriage
          lessonId={id}
          initialDraft={draft}
          initialTitle={lesson.title}
          titleChinese={lesson.titleChinese}
          ownKnown={analysis.words.filter((w) => w.status === "known").map(chip)}
          presumed={analysis.words.filter((w) => w.status === "presumed").map(chip)}
          hskLevel={hskLevel}
          reader={reader}
        />
      </div>
    );
  }

  // Validée
  const links = await prisma.lessonKnowledge.findMany({
    where: { lessonId: id },
    select: { knowledgeItemId: true },
  });
  const items = await listKnowledgeByIds(links.map((l) => l.knowledgeItemId));
  const topics = (lesson.topics as string[] | null) ?? [];
  return (
    <div className="space-y-6">
      <div>{header}</div>
      {draft?.lesson.summary && <p className="text-muted-foreground">{draft.lesson.summary}</p>}
      {topics.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {topics.map((t) => (
            <span key={t} className="rounded-full bg-muted px-2.5 py-0.5 text-xs">
              {t}
            </span>
          ))}
        </div>
      )}
      {reader && <VideoReader data={reader} />}
      {coverage}
      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle className="text-base">Mots appris avec cette ressource ({items.length})</CardTitle>
          <div className="flex flex-wrap gap-2">
            {items.length > 0 && (
              <form action={startSessionFormAction}>
                <input type="hidden" name="kind" value="LESSON" />
                <input type="hidden" name="lessonId" value={id} />
                <SubmitButton size="sm" pendingLabel="Préparation…">
                  <Play /> Réviser ces mots
                </SubmitButton>
              </form>
            )}
            <MoreWordsButton lessonId={id} />
          </div>
        </CardHeader>
        <CardContent>
          {items.length ? <KnowledgeList items={items} /> : <p className="text-sm text-muted-foreground">Aucun mot ajouté depuis cette ressource.</p>}
        </CardContent>
      </Card>
      {!reader && (
        <details className="rounded-xl border bg-card p-4">
          <summary className="cursor-pointer font-medium">Texte de la ressource</summary>
          <div lang="zh-CN" className="mt-3 max-h-[60vh] overflow-y-auto whitespace-pre-line font-cjk leading-relaxed">
            {resource.text}
          </div>
          {resource.convertedFromTraditional && <p className="mt-2 text-xs text-muted-foreground">Converti du chinois traditionnel en simplifié.</p>}
        </details>
      )}
    </div>
  );
}
