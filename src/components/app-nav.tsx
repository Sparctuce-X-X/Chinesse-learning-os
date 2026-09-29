"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  BookOpen,
  CircleAlert,
  Ellipsis,
  Library,
  Newspaper,
  Play,
  Settings,
  Sun,
  Tags,
} from "lucide-react";
import { cn } from "@/lib/utils";

const DESKTOP = [
  { href: "/", label: "Aujourd'hui", icon: Sun },
  { href: "/cours", label: "Cours", icon: BookOpen },
  { href: "/connaissances", label: "Connaissances", icon: Library },
  { href: "/themes", label: "Thèmes", icon: Tags },
  { href: "/ressources", label: "Ressources", icon: Newspaper },
  { href: "/erreurs", label: "Erreurs", icon: CircleAlert },
  { href: "/progression", label: "Progression", icon: BarChart3 },
  { href: "/parametres", label: "Paramètres", icon: Settings },
];

const MOBILE = [
  { href: "/", label: "Aujourd'hui", icon: Sun },
  { href: "/cours", label: "Cours", icon: BookOpen },
  { href: "/reviser", label: "Réviser", icon: Play },
  { href: "/erreurs", label: "Erreurs", icon: CircleAlert },
  { href: "/plus", label: "Plus", icon: Ellipsis },
];

function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  if (href === "/plus") return ["/plus", "/connaissances", "/themes", "/ressources", "/progression", "/parametres", "/oral", "/conversation"].some((p) => pathname.startsWith(p));
  return pathname.startsWith(href);
}

export function DesktopNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Navigation principale" className="flex flex-col gap-1">
      {DESKTOP.map(({ href, label, icon: Icon }) => {
        const active = isActive(pathname, href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
              "focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
              active ? "bg-sidebar-accent text-sidebar-accent-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            <Icon className="size-4" aria-hidden />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

export function MobileNav() {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Navigation principale"
      className="fixed inset-x-0 bottom-0 z-40 border-t bg-card/95 backdrop-blur md:hidden pb-safe"
    >
      <ul className="grid grid-cols-5">
        {MOBILE.map(({ href, label, icon: Icon }) => {
          const active = isActive(pathname, href);
          const primary = href === "/reviser";
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-medium",
                  "focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
                  active ? "text-primary" : "text-muted-foreground",
                )}
              >
                <span
                  className={cn(
                    "flex items-center justify-center rounded-full",
                    primary ? "size-9 bg-primary text-primary-foreground" : "size-6",
                  )}
                >
                  <Icon className={primary ? "size-4" : "size-5"} aria-hidden />
                </span>
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
