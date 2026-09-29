import Link from "next/link";
import { Highlighter, Play } from "lucide-react";
import { prisma } from "@/lib/db/prisma";
import { startSessionFormAction } from "@/app/actions";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ProvenanceBadge, MasteryBadge } from "@/components/badges";
import { SubmitButton } from "@/components/submit-button";
import { SpeakButton } from "@/components/speak-button";
import { masteryOf } from "@/lib/review/mastery";
import { ReanalyzeButton } from "./reanalyze-button";

export async function LessonDetail({ lessonId }: { lessonId: string }) {
  const lesson = await prisma.lesson.findUniqueOrThrow({
    where: { id: lessonId },
    include: {
      knowledge: {
        orderBy: [{ sourcePage: "asc" }, { createdAt: "asc" }],
        include: {
          knowledgeItem: {
            include: {
              vocabulary: true,
              sentence: true,
              grammarPoint: true,
              reviewState: true,
              examples: { where: { lessonId }, take: 3 },
              mistakes: { where: { resolvedAt: null }, select: { occurrences: true } },
            },
          },
        },
      },
      corrections: { orderBy: { sourcePage: "asc" } },
      exercises: { orderBy: { sourcePage: "asc" } },
      documents: { include: { pages: { orderBy: { pageNumber: "asc" } } } },
    },
  });

  const items = lesson.knowledge;
  const vocab = items.filter((k) => k.knowledgeItem.vocabulary);
  const grammar = items.filter((k) => k.knowledgeItem.grammarPoint);
  const sentences = items.filter((k) => k.knowledgeItem.sentence);
  const topics = (lesson.topics as string[] | null) ?? [];
  const doc = lesson.documents[0];

  const mastery = (k: (typeof items)[number]["knowledgeItem"]) => masteryOf(k.reviewState, k.mistakes);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <form action={startSessionFormAction}>
          <input type="hidden" name="kind" value="LESSON" />
          <input type="hidden" name="lessonId" value={lesson.id} />
          <SubmitButton pendingLabel="Préparation…" disabled={items.length === 0}>
            <Play /> Réviser ce cours
          </SubmitButton>
        </form>
        <ReanalyzeButton lessonId={lesson.id} />
        {topics.map((t) => (
          <span key={t} className="rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground">
            {t}
          </span>
        ))}
      </div>
      {lesson.notes && <p className="rounded-xl bg-muted/60 px-4 py-3 text-sm whitespace-pre-line">{lesson.notes}</p>}

      <Tabs defaultValue="vocab">
        <TabsList className="h-auto w-full flex-wrap justify-start">
          <TabsTrigger value="vocab" className="flex-none">Vocabulaire {vocab.length}</TabsTrigger>
          <TabsTrigger value="grammar" className="flex-none">Grammaire {grammar.length}</TabsTrigger>
          <TabsTrigger value="sentences" className="flex-none">Phrases {sentences.length}</TabsTrigger>
          <TabsTrigger value="corrections" className="flex-none">Corrections {lesson.corrections.length}</TabsTrigger>
          <TabsTrigger value="exercises" className="flex-none">Exercices {lesson.exercises.length}</TabsTrigger>
          <TabsTrigger value="document" className="flex-none">Document</TabsTrigger>
        </TabsList>

        <TabsContent value="vocab" className="mt-4">
          {vocab.length === 0 ? (
            <Empty>Aucun vocabulaire dans ce cours.</Empty>
          ) : (
            <ul className="grid gap-2 sm:grid-cols-2">
              {vocab.map(({ knowledgeItem: k, sourcePage, highlighted }) => (
                <li key={k.id}>
                  <Link href={`/connaissances/${k.id}`} className="flex items-start justify-between gap-3 rounded-xl border bg-card px-4 py-3 transition hover:border-primary/40">
                    <div className="min-w-0">
                      <p lang="zh-CN" className="font-hanzi text-2xl">{k.vocabulary!.hanzi}</p>
                      <p className="text-sm text-muted-foreground">{k.vocabulary!.pinyin}</p>
                      <p className="text-sm">{k.vocabulary!.french ?? k.vocabulary!.english}</p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <MasteryBadge level={mastery(k)} />
                      <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                        {highlighted && <Highlighter className="size-3 text-warning" aria-label="Surligné" />}
                        {sourcePage ? `p. ${sourcePage}` : ""}
                      </span>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </TabsContent>

        <TabsContent value="grammar" className="mt-4 space-y-3">
          {grammar.length === 0 && <Empty>Aucun point de grammaire.</Empty>}
          {grammar.map(({ knowledgeItem: k, sourcePage }) => (
            <Link key={k.id} href={`/connaissances/${k.id}`} className="block rounded-xl border bg-card px-4 py-3 transition hover:border-primary/40">
              <div className="flex items-start justify-between gap-2">
                <p lang="zh-CN" className="font-hanzi text-xl">{k.grammarPoint!.name}</p>
                <span className="text-[11px] text-muted-foreground">{sourcePage ? `p. ${sourcePage}` : ""}</span>
              </div>
              {k.grammarPoint!.structure && <p className="text-sm text-muted-foreground">{k.grammarPoint!.structure}</p>}
              {k.grammarPoint!.explanation && (
                <p className="mt-1 text-sm">
                  {k.grammarPoint!.explanation} <ProvenanceBadge source={k.grammarPoint!.explanationSource} compact />
                </p>
              )}
              {k.examples.map((e) => (
                <p key={e.id} lang="zh-CN" className="mt-1 text-sm text-muted-foreground">
                  {e.hanzi}
                </p>
              ))}
            </Link>
          ))}
        </TabsContent>

        <TabsContent value="sentences" className="mt-4">
          {sentences.length === 0 ? (
            <Empty>Aucune phrase.</Empty>
          ) : (
            <ul className="divide-y rounded-xl border bg-card">
              {sentences.map(({ knowledgeItem: k, sourcePage }) => (
                <li key={k.id} className="flex items-start justify-between gap-3 px-4 py-3">
                  <Link href={`/connaissances/${k.id}`} className="min-w-0 hover:underline">
                    <p lang="zh-CN" className="text-lg">{k.sentence!.hanzi}</p>
                    {k.sentence!.pinyin && <p className="text-sm text-muted-foreground">{k.sentence!.pinyin}</p>}
                    <p className="text-sm">{k.sentence!.french ?? k.sentence!.english}</p>
                  </Link>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <SpeakButton text={k.sentence!.hanzi} size="icon-sm" label="Écouter la phrase" />
                    <ProvenanceBadge source={k.sourceType} compact />
                    <span className="text-[11px] text-muted-foreground">{sourcePage ? `p. ${sourcePage}` : ""}</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </TabsContent>

        <TabsContent value="corrections" className="mt-4 space-y-3">
          {lesson.corrections.length === 0 && <Empty>Aucune correction relevée dans ce cours.</Empty>}
          {lesson.corrections.map((c) => (
            <div key={c.id} className="rounded-xl border bg-card px-4 py-3">
              <p lang="zh-CN" className="text-destructive line-through decoration-1">
                <span className="sr-only">Incorrect : </span>✗ {c.incorrect}
              </p>
              <p lang="zh-CN" className="text-lg text-success">
                <span className="sr-only">Correct : </span>✓ {c.correct}
              </p>
              {c.explanation && <p className="mt-1 text-sm text-muted-foreground">{c.explanation}</p>}
              <div className="mt-1 flex gap-2 text-[11px] text-muted-foreground">
                <ProvenanceBadge source={c.sourceType} compact /> {c.sourcePage ? `p. ${c.sourcePage}` : ""}
              </div>
            </div>
          ))}
        </TabsContent>

        <TabsContent value="exercises" className="mt-4">
          {lesson.exercises.length === 0 ? (
            <Empty>Aucun exercice relevé.</Empty>
          ) : (
            <ul className="space-y-2">
              {lesson.exercises.map((e) => {
                const meta = (e.metadata as { context?: string | null } | null) ?? {};
                return (
                  <li key={e.id} className="rounded-xl border bg-card px-4 py-3">
                    <p lang="zh-CN">{e.prompt}</p>
                    {meta.context && <p className="text-sm text-muted-foreground">{meta.context}</p>}
                    <p className="mt-1 text-[11px] text-muted-foreground">{e.sourcePage ? `p. ${e.sourcePage}` : ""}</p>
                  </li>
                );
              })}
            </ul>
          )}
          {lesson.exercises.length > 0 && (
            <p className="mt-3 text-sm text-muted-foreground">
              Les questions de discussion sont reprises dans les <Link href="/oral" className="text-primary hover:underline">exercices d&apos;oral</Link>.
            </p>
          )}
        </TabsContent>

        <TabsContent value="document" className="mt-4 space-y-3">
          {doc ? (
            <>
              <p className="text-sm text-muted-foreground">
                {doc.filename} · {doc.pageCount} pages ·{" "}
                <a href={`/api/lessons/${lesson.id}/pdf`} target="_blank" rel="noreferrer" className="text-primary hover:underline">
                  ouvrir le PDF
                </a>
              </p>
              <details className="rounded-xl border bg-card">
                <summary className="cursor-pointer px-4 py-3 text-sm font-medium">Texte extrait, page par page</summary>
                <div className="space-y-4 border-t px-4 py-3">
                  {doc.pages.map((p) => (
                    <section key={p.id}>
                      <h3 className="text-xs font-semibold text-muted-foreground">
                        Page {p.pageNumber} {p.likelyImage && "· image (texte non extractible)"}
                      </h3>
                      <pre lang="zh-CN" className="mt-1 font-cjk text-sm whitespace-pre-wrap">{p.text || "—"}</pre>
                    </section>
                  ))}
                </div>
              </details>
            </>
          ) : (
            <Empty>Aucun document.</Empty>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="rounded-xl border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">{children}</p>;
}
