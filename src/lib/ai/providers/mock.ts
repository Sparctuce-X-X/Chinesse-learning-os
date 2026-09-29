import "server-only";
import type { z } from "zod";
import { AIError, type AIProvider, type AIStatus, type StructuredRequest } from "../types";

/**
 * Fournisseur simulé, utilisé UNIQUEMENT par les tests automatisés (AI_PROVIDER=mock).
 * L'interface affiche un bandeau « IA simulée » lorsqu'il est actif.
 * Les réponses sont produites par des gestionnaires déterministes par tâche.
 */
export type MockHandler = (req: StructuredRequest<z.ZodTypeAny>) => unknown;

export class MockProvider implements AIProvider {
  readonly name = "mock";
  readonly label = "IA simulée (tests)";
  private handlers = new Map<string, MockHandler>();

  register(task: string, handler: MockHandler) {
    this.handlers.set(task, handler);
  }

  async status(): Promise<AIStatus> {
    return { available: true, provider: this.name, label: this.label, simulated: true };
  }

  async generate<S extends z.ZodTypeAny>(req: StructuredRequest<S>): Promise<z.output<S>> {
    if (process.env.AI_MOCK_FAIL === req.task || process.env.AI_MOCK_FAIL === "all") {
      throw new AIError("échec simulé", "PROVIDER_ERROR", false);
    }
    const handler = this.handlers.get(req.task);
    if (!handler) throw new AIError(`aucune réponse simulée pour ${req.task}`, "PROVIDER_ERROR");
    const parsed = req.schema.safeParse(handler(req as StructuredRequest<z.ZodTypeAny>));
    if (!parsed.success) throw new AIError("JSON non conforme", "INVALID_OUTPUT");
    return parsed.data;
  }
}
