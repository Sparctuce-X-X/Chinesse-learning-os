import Link from "next/link";
import { Library, Search, Tags } from "lucide-react";
import { listKnowledge, type KnowledgeFilter } from "@/server/knowledge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { EmptyState, PageHeader } from "@/components/page";
import { KnowledgeList } from "@/components/knowledge-list";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const metadata = { title: "Connaissances" };

const FILTERS: { value: KnowledgeFilter; label: string }[] = [
  { value: "all", label: "Tout" },
  { value: "vocabulary", label: "Vocabulaire" },
  { value: "expression", label: "Expressions" },
  { value: "sentence", label: "Phrases" },
  { value: "grammar", label: "Grammaire" },
  { value: "weak", label: "À travailler" },
  { value: "mastered", label: "Maîtrisé" },
  { value: "new", label: "Nouveau" },
];

export default async function KnowledgePage(props: PageProps<"/connaissances">) {
  const sp = (await props.searchParams) as { filtre?: string; q?: string };
  const filter = (FILTERS.find((f) => f.value === sp.filtre)?.value ?? "all") as KnowledgeFilter;
  const q = (sp.q ?? "").slice(0, 100);
  const items = await listKnowledge(filter, q);
  const hrefFor = (f: string) => `/connaissances?${new URLSearchParams({ ...(f !== "all" ? { filtre: f } : {}), ...(q ? { q } : {}) })}`;

  return (
    <div>
      <PageHeader
        title="Connaissances"
        description="Tout le chinois appris dans tes cours."
        actions={
          <Button asChild variant="outline">
            <Link href="/themes">
              <Tags /> Par thème
            </Link>
          </Button>
        }
      />
      <form className="mb-4 flex gap-2" role="search">
        {filter !== "all" && <input type="hidden" name="filtre" value={filter} />}
        <div className="relative flex-1">
          <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <label htmlFor="q" className="sr-only">
            Rechercher
          </label>
          <Input id="q" name="q" defaultValue={q} placeholder="汉字, pinyin (lvxing) ou français" className="h-10 pl-9" />
        </div>
        <Button type="submit" variant="outline" className="h-10">
          Rechercher
        </Button>
      </form>
      <nav aria-label="Filtres" className="-mx-4 mb-5 flex gap-2 overflow-x-auto px-4 pb-1">
        {FILTERS.map((f) => (
          <Link
            key={f.value}
            href={hrefFor(f.value)}
            aria-current={filter === f.value ? "page" : undefined}
            className={cn(
              "shrink-0 rounded-full border px-3 py-1.5 text-sm transition",
              filter === f.value ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:border-primary/40",
            )}
          >
            {f.label}
          </Link>
        ))}
      </nav>

      {items.length === 0 ? (
        <EmptyState
          icon={Library}
          title={q || filter !== "all" ? "Aucun résultat" : "Ta base est vide"}
          description={q || filter !== "all" ? "Essaie une autre recherche ou un autre filtre." : "Les connaissances apparaissent ici dès que tu valides un cours."}
          action={
            !q && filter === "all" ? (
              <Button asChild>
                <Link href="/cours/importer">Importer un cours</Link>
              </Button>
            ) : undefined
          }
        />
      ) : (
        <>
          <p className="mb-2 text-xs text-muted-foreground">{items.length} élément{items.length > 1 ? "s" : ""}</p>
          <KnowledgeList items={items} />
        </>
      )}
    </div>
  );
}
