import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Play } from "lucide-react";
import { getTheme, listThemeOptions } from "@/server/themes";
import { listKnowledgeByIds } from "@/server/knowledge";
import { startSessionFormAction } from "@/app/actions";
import { formatDate, Stat } from "@/components/page";
import { KnowledgeList } from "@/components/knowledge-list";
import { ProvenanceBadge } from "@/components/badges";
import { SubmitButton } from "@/components/submit-button";
import { RemoveFromThemeButton, ThemeManager } from "@/features/themes/theme-manager";

export const dynamic = "force-dynamic";

export async function generateMetadata(props: PageProps<"/themes/[id]">) {
  const { id } = await props.params;
  const t = await getTheme(id);
  return { title: t?.theme.name ?? "Thème" };
}

const ORDER = { WEAK: 0, LEARNING: 1, NEW: 2, CONSOLIDATED: 3, MASTERED: 4 } as const;

export default async function ThemePage(props: PageProps<"/themes/[id]">) {
  const { id } = await props.params;
  const data = await getTheme(id);
  if (!data) notFound();
  const { theme, itemIds, activeIds, linkSource, lessons } = data;
  const [items, options] = await Promise.all([listKnowledgeByIds(itemIds), listThemeOptions()]);
  items.sort((a, b) => ORDER[a.mastery] - ORDER[b.mastery] || a.primary.localeCompare(b.primary, "zh"));
  const learned = items.filter((i) => i.mastery === "CONSOLIDATED" || i.mastery === "MASTERED").length;
  const weak = items.filter((i) => i.mastery === "WEAK").length;
  const fresh = items.filter((i) => i.mastery === "NEW").length;

  return (
    <div className="space-y-6">
      <Link href="/themes" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden /> Thèmes
      </Link>

      <header className="rounded-2xl border bg-card p-6">
        <div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
          <span>Thème</span>
          <ProvenanceBadge source={theme.source} />
        </div>
        <h1 className="flex items-center gap-3 text-2xl font-semibold tracking-tight sm:text-3xl">
          <span aria-hidden>{theme.emoji ?? "🏷️"}</span>
          {theme.name}
        </h1>
        {theme.description && <p className="mt-2 text-muted-foreground">{theme.description}</p>}
        {lessons.length > 0 && (
          <p className="mt-3 text-sm text-muted-foreground">
            {lessons.length > 1 ? `Vient de ${lessons.length} sources` : "Vient de"} :{" "}
            {lessons.map((l, i) => (
              <span key={l.id}>
                {i > 0 && ", "}
                <Link href={`/${l.kind === "RESOURCE" ? "ressources" : "cours"}/${l.id}`} className="underline underline-offset-2 hover:text-foreground">
                  {l.title}
                </Link>{" "}
                ({formatDate(l.date, { day: "numeric", month: "short" })}, {l.count})
              </span>
            ))}
          </p>
        )}
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Stat value={items.length} label="éléments" />
          <Stat value={learned} label="consolidés" />
          <Stat value={weak} label="à travailler" />
          <Stat value={fresh} label="jamais révisés" />
        </div>
        <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          {activeIds.length > 0 ? (
            <form action={startSessionFormAction}>
              <input type="hidden" name="kind" value="KNOWLEDGE" />
              {activeIds.map((k) => (
                <input key={k} type="hidden" name="knowledgeItemId" value={k} />
              ))}
              <SubmitButton size="lg">
                <Play /> Réviser ce thème
              </SubmitButton>
            </form>
          ) : (
            <span />
          )}
          <ThemeManager
            theme={{ id: theme.id, name: theme.name, emoji: theme.emoji, description: theme.description, total: items.length }}
            others={options.filter((o) => o.id !== theme.id)}
          />
        </div>
      </header>

      {items.length === 0 ? (
        <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
          Ce thème est vide. Ajoute des mots depuis leur fiche (section « Thèmes »).
        </p>
      ) : (
        <section aria-labelledby="theme-items">
          <h2 id="theme-items" className="mb-2 text-sm font-medium text-muted-foreground">
            Du plus fragile au mieux maîtrisé
          </h2>
          <KnowledgeList
            items={items}
            aside={(k) => (
              <span className="flex items-center gap-1">
                {linkSource.get(k.id) === "USER" && <span className="sr-only">rangé par toi</span>}
                <RemoveFromThemeButton knowledgeItemId={k.id} themeId={theme.id} label={k.primary} />
              </span>
            )}
          />
        </section>
      )}
    </div>
  );
}
