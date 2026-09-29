import Link from "next/link";
import { BarChart3, ChevronRight, Library, MessagesSquare, Mic, Newspaper, Settings, Tags } from "lucide-react";
import { PageHeader } from "@/components/page";

export const metadata = { title: "Plus" };

const LINKS = [
  { href: "/connaissances", label: "Connaissances", desc: "Tout le chinois appris", icon: Library },
  { href: "/themes", label: "Thèmes", desc: "Tes mots rangés par sujet", icon: Tags },
  { href: "/ressources", label: "Ressources", desc: "Apprendre avec articles, vidéos, textes", icon: Newspaper },
  { href: "/oral", label: "Oral", desc: "Répondre à voix haute", icon: Mic },
  { href: "/conversation", label: "Conversation IA", desc: "Petites mises en situation", icon: MessagesSquare },
  { href: "/progression", label: "Progression", desc: "Régularité et rétention", icon: BarChart3 },
  { href: "/parametres", label: "Paramètres", desc: "Sessions, IA, audio", icon: Settings },
];

export default function MorePage() {
  return (
    <div>
      <PageHeader title="Plus" />
      <ul className="divide-y rounded-xl border bg-card">
        {LINKS.map(({ href, label, desc, icon: Icon }) => (
          <li key={href}>
            <Link href={href} className="flex min-h-14 items-center gap-3 px-4 py-3 hover:bg-muted/50">
              <Icon className="size-5 text-muted-foreground" aria-hidden />
              <span className="flex-1">
                <span className="block font-medium">{label}</span>
                <span className="block text-xs text-muted-foreground">{desc}</span>
              </span>
              <ChevronRight className="size-4 text-muted-foreground" aria-hidden />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
