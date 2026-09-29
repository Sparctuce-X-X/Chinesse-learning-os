import Link from "next/link";
import { FileText, Link2, Loader2, Newspaper, Type, Video } from "lucide-react";
import { listResources } from "@/server/resources";
import { getUser } from "@/server/user";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState, formatDate, Hanzi, PageHeader } from "@/components/page";
import { LessonStatusBadge } from "@/features/lessons/status-badge";
import { AddResourceForm } from "@/features/resources/add-resource-form";
import { HskLevelSelect } from "@/features/resources/hsk-level-select";

export const dynamic = "force-dynamic";
export const metadata = { title: "Ressources" };

const KIND = {
  ARTICLE: { label: "Article", icon: Link2 },
  TEXT: { label: "Texte", icon: Type },
  DOCUMENT: { label: "Document", icon: FileText },
  VIDEO: { label: "Vidéo", icon: Video },
} as const;

export default async function ResourcesPage() {
  const [resources, user] = await Promise.all([listResources(), getUser()]);
  return (
    <div className="space-y-6">
      <PageHeader
        title="Ressources"
        description="Vidéos YouTube, articles, documents : apprends les mots du contenu que tu choisis. Tes cours restent prioritaires dans les révisions."
        className="mb-0"
      />
      <AddResourceForm />
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="font-semibold">Mes ressources</h2>
        <HskLevelSelect level={user.hskLevel} />
      </div>
      {resources.length === 0 ? (
        <EmptyState
          icon={Newspaper}
          title="Aucune ressource pour l'instant"
          description="Ajoute une vidéo YouTube, un article ou un texte : l'application repère les mots que tu ne connais pas encore et te propose les plus utiles."
        />
      ) : (
        <ol className="space-y-3">
          {resources.map((r) => {
            const k = KIND[r.kind];
            const Icon = k.icon;
            const processing = r.status === "ANALYZING" || r.status === "EXTRACTING" || r.status === "UPLOADED";
            return (
              <li key={r.lessonId}>
                <Link
                  href={`/ressources/${r.lessonId}`}
                  className="block rounded-xl focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  <Card className="transition hover:border-primary/40 hover:shadow-sm">
                    <CardContent className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex min-w-0 items-center gap-3">
                        {r.mediaId && (
                          // eslint-disable-next-line @next/next/no-img-element -- miniature YouTube externe, pas d'optimisation nécessaire
                          <img
                            src={`https://i.ytimg.com/vi/${r.mediaId}/mqdefault.jpg`}
                            alt=""
                            width={96}
                            height={54}
                            loading="lazy"
                            className="hidden aspect-video w-24 shrink-0 rounded-md bg-muted object-cover sm:block"
                          />
                        )}
                        <div className="min-w-0">
                          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                            <Icon className="size-3.5" aria-hidden /> {k.label}
                            {r.siteName ? ` · ${r.siteName}` : ""} · {formatDate(r.createdAt, { day: "numeric", month: "long" })}
                          </p>
                          <h3 className="truncate font-semibold">{r.title}</h3>
                          {r.titleChinese && r.titleChinese !== r.title && (
                            <Hanzi className="block truncate text-sm text-muted-foreground">{r.titleChinese}</Hanzi>
                          )}
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                        {processing ? (
                          <span className="flex items-center gap-1">
                            <Loader2 className="size-3.5 animate-spin" aria-hidden />{" "}
                            {r.status === "EXTRACTING" && r.kind === "VIDEO" ? "Transcription…" : "Analyse…"}
                          </span>
                        ) : (
                          <span>
                            {r.coverage} % connus{r.status === "VALIDATED" ? ` · ${r.wordsAdded} mots ajoutés` : ""}
                          </span>
                        )}
                        <LessonStatusBadge status={r.status} resource />
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
