import { cn } from "@/lib/utils";

const STATUS: Record<string, { label: string; className: string }> = {
  UPLOADED: { label: "Importé", className: "bg-muted text-muted-foreground" },
  EXTRACTING: { label: "Lecture du PDF", className: "bg-muted text-muted-foreground" },
  ANALYZING: { label: "Analyse en cours", className: "bg-ai-soft text-ai" },
  READY_FOR_REVIEW: { label: "À valider", className: "bg-warning-soft text-warning" },
  VALIDATED: { label: "Validé", className: "bg-success-soft text-success" },
  FAILED: { label: "Échec", className: "bg-danger-soft text-destructive" },
};

export function LessonStatusBadge({ status, resource = false }: { status: string; resource?: boolean }) {
  const base = STATUS[status] ?? STATUS.UPLOADED;
  // Ressource : l'étape « lecture » est la transcription d'une vidéo, pas la lecture d'un PDF.
  const s = resource && status === "EXTRACTING" ? { ...base, label: "Transcription" } : base;
  return <span className={cn("inline-flex rounded-full px-2 py-0.5 text-xs font-medium", s.className)}>{s.label}</span>;
}
