import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export function PageHeader({
  title,
  description,
  actions,
  className,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <header className={cn("mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between", className)}>
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </header>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: LucideIcon;
  title: string;
  description?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed bg-card/60 px-6 py-12 text-center">
      <span className="mb-3 flex size-12 items-center justify-center rounded-full bg-accent text-accent-foreground">
        <Icon className="size-6" aria-hidden />
      </span>
      <h2 className="text-base font-semibold">{title}</h2>
      {description && <p className="mt-1 max-w-sm text-sm text-muted-foreground">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function Hanzi({ children, className, as: As = "span" }: { children: React.ReactNode; className?: string; as?: "span" | "p" | "h1" | "h2" | "div" }) {
  return (
    <As lang="zh-CN" className={cn("font-cjk", className)}>
      {children}
    </As>
  );
}

export function Stat({ value, label, className }: { value: React.ReactNode; label: string; className?: string }) {
  return (
    <div className={cn("rounded-xl bg-muted/60 px-4 py-3", className)}>
      <div className="text-2xl font-semibold tabular-nums">{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  );
}

export function formatDate(d: Date | string | null | undefined, opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "long", year: "numeric" }) {
  if (!d) return "—";
  return new Intl.DateTimeFormat("fr-FR", opts).format(typeof d === "string" ? new Date(d) : d);
}

export function formatRelativeDay(d: Date | null | undefined): string {
  if (!d) return "—";
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(d);
  target.setHours(0, 0, 0, 0);
  const diff = Math.round((target.getTime() - today.getTime()) / 86_400_000);
  if (diff === 0) return "aujourd'hui";
  if (diff === 1) return "demain";
  if (diff === -1) return "hier";
  if (diff > 1 && diff < 7) return `dans ${diff} jours`;
  if (diff < -1 && diff > -7) return `il y a ${-diff} jours`;
  return formatDate(d, { day: "numeric", month: "long" });
}
