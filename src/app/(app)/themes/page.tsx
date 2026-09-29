import Link from "next/link";
import { FileUp, FolderOpen, Tags } from "lucide-react";
import { prisma } from "@/lib/db/prisma";
import { getAIStatus } from "@/lib/ai";
import { getClassifyState, listThemes } from "@/server/themes";
import { getUserId } from "@/server/user";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { EmptyState, PageHeader } from "@/components/page";
import { ProvenanceBadge } from "@/components/badges";
import { ClassifyPanel } from "@/features/themes/classify-panel";
import { NewThemeButton } from "@/features/themes/new-theme-button";

export const dynamic = "force-dynamic";
export const metadata = { title: "Thèmes" };

export default async function ThemesPage() {
  const [{ themes, unclassified, unthemed }, ai, knowledgeCount] = await Promise.all([
    listThemes(),
    getAIStatus(),
    prisma.knowledgeItem.count({ where: { userId: await getUserId() } }),
  ]);
  const state = getClassifyState();

  return (
    <div>
      <PageHeader
        title="Thèmes"
        description="Tes mots rangés par sujet de conversation, quel que soit le cours d'où ils viennent. Chaque nouveau cours vient compléter les thèmes."
        actions={<NewThemeButton />}
      />
      <ClassifyPanel
        initial={{ running: state.running, lastError: state.lastError, unclassified, lastClassified: state.lastClassified }}
        aiAvailable={ai.available}
        aiReason={ai.reason}
      />

      {themes.length === 0 && unthemed === 0 ? (
        knowledgeCount === 0 ? (
          <EmptyState
            icon={Tags}
            title="Aucun thème pour l'instant"
            description="Les thèmes se créent automatiquement à partir des mots de tes cours."
            action={
              <Button asChild>
                <Link href="/cours/importer">
                  <FileUp /> Importer un cours
                </Link>
              </Button>
            }
          />
        ) : (
          !state.running &&
          unclassified === 0 && <EmptyState icon={Tags} title="Aucun thème" description="Crée un thème ou range tes mots depuis leur fiche." />
        )
      ) : (
        <>
          <p className="mb-3 text-xs text-muted-foreground">
            {themes.length} thème{themes.length > 1 ? "s" : ""} · rangement proposé par l&apos;IA, modifiable à tout moment
          </p>
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {themes.map((t) => (
              <li key={t.id}>
                <Link href={`/themes/${t.id}`} className="block h-full rounded-xl focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none">
                  <Card className="h-full transition hover:border-primary/40 hover:shadow-sm">
                    <CardContent className="flex h-full flex-col gap-3">
                      <div className="flex items-start gap-3">
                        <span aria-hidden className="text-2xl leading-none">
                          {t.emoji ?? "🏷️"}
                        </span>
                        <div className="min-w-0 flex-1">
                          <h2 className="font-semibold leading-tight">{t.name}</h2>
                          <p className="text-sm text-muted-foreground">
                            {t.total} élément{t.total > 1 ? "s" : ""}
                          </p>
                        </div>
                        {t.source === "USER" && <ProvenanceBadge source="USER" compact />}
                      </div>
                      <div className="mt-auto space-y-1.5">
                        <Progress value={t.total ? (t.learned / t.total) * 100 : 0} aria-label={`${t.learned} sur ${t.total} consolidés`} />
                        <p className="flex flex-wrap gap-x-3 text-xs text-muted-foreground">
                          <span>{t.learned} consolidé{t.learned > 1 ? "s" : ""}</span>
                          {t.due > 0 && <span className="font-medium text-foreground">{t.due} à réviser</span>}
                          {t.weak > 0 && <span className="text-destructive">{t.weak} à travailler</span>}
                          {t.isNew > 0 && <span>{t.isNew} nouveau{t.isNew > 1 ? "x" : ""}</span>}
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              </li>
            ))}
            {unthemed > 0 && (
              <li>
                <Link href="/themes/non-classes" className="block h-full rounded-xl focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none">
                  <Card className="h-full border-dashed transition hover:border-primary/40">
                    <CardContent className="flex items-start gap-3">
                      <FolderOpen className="size-6 text-muted-foreground" aria-hidden />
                      <div>
                        <h2 className="font-semibold leading-tight">Non classés</h2>
                        <p className="text-sm text-muted-foreground">
                          {unthemed} élément{unthemed > 1 ? "s" : ""} sans thème
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              </li>
            )}
          </ul>
        </>
      )}
    </div>
  );
}
