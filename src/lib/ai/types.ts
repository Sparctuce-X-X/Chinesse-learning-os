import type { z } from "zod";

export type ModelTier = "fast" | "smart";

export interface StructuredRequest<S extends z.ZodTypeAny> {
  /** Nom court de la tâche (journalisation). */
  task: string;
  system: string;
  prompt: string;
  schema: S;
  tier: ModelTier;
  timeoutMs: number;
  /** Fichiers PDF locaux que le modèle peut consulter (lecture visuelle). */
  pdfPath?: string;
  /** Données transmises au fournisseur simulé (tests uniquement). */
  mockContext?: unknown;
}

export interface AIStatus {
  available: boolean;
  provider: string;
  label: string;
  reason?: string;
  simulated?: boolean;
}

export interface AIProvider {
  readonly name: string;
  readonly label: string;
  status(): Promise<AIStatus>;
  generate<S extends z.ZodTypeAny>(req: StructuredRequest<S>): Promise<z.output<S>>;
}

export type AIErrorCode =
  | "UNAVAILABLE"
  | "TIMEOUT"
  | "INVALID_OUTPUT"
  | "PROVIDER_ERROR"
  | "RATE_LIMITED";

export class AIError extends Error {
  constructor(
    message: string,
    public readonly code: AIErrorCode,
    public readonly retryable = false,
  ) {
    super(message);
    this.name = "AIError";
  }
}

/** Message utilisateur en français pour une erreur IA. */
export function aiErrorMessage(err: unknown): string {
  if (err instanceof AIError) {
    switch (err.code) {
      case "UNAVAILABLE":
        return `IA indisponible : ${err.message}`;
      case "TIMEOUT":
        return "L'IA a mis trop de temps à répondre. Réessaie dans un instant.";
      case "INVALID_OUTPUT":
        return "L'IA a renvoyé une réponse inexploitable. Réessaie.";
      case "RATE_LIMITED":
        return "Limite d'utilisation de l'IA atteinte. Réessaie plus tard.";
      default:
        return `Erreur de l'IA : ${err.message}`;
    }
  }
  return "Erreur inattendue de l'IA.";
}
