import { Bot, GraduationCap, Globe, UserRound, CircleCheck, CircleX, CircleMinus, CircleDot } from "lucide-react";
import { cn } from "@/lib/utils";
import { MASTERY_LABEL, type MasteryLevel } from "@/lib/review/mastery";

type Provenance = "TEACHER" | "AI" | "USER" | "EXTERNAL";

const PROVENANCE = {
  TEACHER: { label: "Professeure", icon: GraduationCap, className: "bg-teacher-soft text-teacher" },
  AI: { label: "IA", icon: Bot, className: "bg-ai-soft text-ai" },
  USER: { label: "Moi", icon: UserRound, className: "bg-user-soft text-user" },
  EXTERNAL: { label: "Ressource", icon: Globe, className: "bg-muted text-muted-foreground" },
} as const;

export function ProvenanceBadge({ source, className, compact }: { source: Provenance | null | undefined; className?: string; compact?: boolean }) {
  if (!source) return null;
  const p = PROVENANCE[source];
  const Icon = p.icon;
  return (
    <span
      className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium", p.className, className)}
      title={`Provenance : ${p.label}`}
    >
      <Icon className="size-3" aria-hidden />
      {compact ? <span className="sr-only">{p.label}</span> : p.label}
    </span>
  );
}

const CONFIDENCE = {
  HIGH: { label: "Confiance élevée", className: "bg-success-soft text-success" },
  MEDIUM: { label: "Confiance moyenne", className: "bg-muted text-muted-foreground" },
  LOW: { label: "Incertain", className: "bg-warning-soft text-warning ring-1 ring-warning/30" },
} as const;

export function ConfidenceBadge({ level }: { level: "HIGH" | "MEDIUM" | "LOW" }) {
  const c = CONFIDENCE[level];
  return <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium", c.className)}>{c.label}</span>;
}

const MASTERY_CLASS: Record<MasteryLevel, string> = {
  NEW: "bg-muted text-muted-foreground",
  LEARNING: "bg-accent text-accent-foreground",
  WEAK: "bg-danger-soft text-destructive",
  CONSOLIDATED: "bg-success-soft text-success",
  MASTERED: "bg-success text-white",
};

export function MasteryBadge({ level }: { level: MasteryLevel }) {
  return (
    <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium", MASTERY_CLASS[level])}>
      {MASTERY_LABEL[level]}
    </span>
  );
}

const RESULT = {
  CORRECT: { label: "Correct", icon: CircleCheck, className: "text-success" },
  MOSTLY_CORRECT: { label: "Presque", icon: CircleDot, className: "text-warning" },
  INCORRECT: { label: "Incorrect", icon: CircleX, className: "text-destructive" },
  SKIPPED: { label: "Passé", icon: CircleMinus, className: "text-muted-foreground" },
} as const;

/** Résultat : icône + texte (jamais uniquement la couleur). */
export function ResultLabel({ result, className }: { result: keyof typeof RESULT; className?: string }) {
  const r = RESULT[result];
  const Icon = r.icon;
  return (
    <span className={cn("inline-flex items-center gap-1 text-sm font-medium", r.className, className)}>
      <Icon className="size-4" aria-hidden />
      {r.label}
    </span>
  );
}

export const TYPE_LABEL: Record<string, string> = {
  VOCABULARY: "Vocabulaire",
  EXPRESSION: "Expression",
  SENTENCE: "Phrase",
  GRAMMAR: "Grammaire",
};
