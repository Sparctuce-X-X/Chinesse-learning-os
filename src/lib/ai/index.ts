import "server-only";
import type { z } from "zod";
import { AIError, type AIProvider, type AIStatus, type StructuredRequest } from "./types";
import { ClaudeCliProvider } from "./providers/claude-cli";
import { AnthropicApiProvider } from "./providers/anthropic-api";
import { MockProvider } from "./providers/mock";
import { registerDefaultMocks } from "./providers/mock-fixtures";
import { logError } from "@/lib/log";

class NoAIProvider implements AIProvider {
  readonly name = "none";
  readonly label = "Aucune IA";
  async status(): Promise<AIStatus> {
    return {
      available: false,
      provider: this.name,
      label: this.label,
      reason: "L'IA est désactivée (AI_PROVIDER=none).",
    };
  }
  async generate<S extends z.ZodTypeAny>(): Promise<z.output<S>> {
    throw new AIError("l'IA est désactivée", "UNAVAILABLE");
  }
}

const globalForAI = globalThis as unknown as { __aiProvider?: AIProvider; __mockProvider?: MockProvider };

export function getMockProvider(): MockProvider {
  if (!globalForAI.__mockProvider) {
    globalForAI.__mockProvider = new MockProvider();
    registerDefaultMocks(globalForAI.__mockProvider);
  }
  return globalForAI.__mockProvider;
}

/**
 * Sélection du fournisseur :
 *  - AI_PROVIDER=claude-cli | anthropic | none | mock
 *  - par défaut (auto) : API si ANTHROPIC_API_KEY est définie, sinon CLI Claude Code.
 */
export function getAIProvider(): AIProvider {
  if (globalForAI.__aiProvider) return globalForAI.__aiProvider;
  const choice = (process.env.AI_PROVIDER || "auto").toLowerCase();
  let provider: AIProvider;
  switch (choice) {
    case "none":
      provider = new NoAIProvider();
      break;
    case "mock":
      provider = getMockProvider();
      break;
    case "anthropic":
      provider = new AnthropicApiProvider();
      break;
    case "claude-cli":
      provider = new ClaudeCliProvider();
      break;
    default:
      provider = process.env.ANTHROPIC_API_KEY ? new AnthropicApiProvider() : new ClaudeCliProvider();
  }
  globalForAI.__aiProvider = provider;
  return provider;
}

export async function getAIStatus(): Promise<AIStatus> {
  try {
    return await getAIProvider().status();
  } catch {
    return { available: false, provider: "unknown", label: "IA", reason: "Statut indisponible." };
  }
}

/** Appel structuré avec une nouvelle tentative pour les erreurs transitoires. */
export async function runAI<S extends z.ZodTypeAny>(
  req: StructuredRequest<S>,
  retries = 1,
): Promise<z.output<S>> {
  const provider = getAIProvider();
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await provider.generate(req);
    } catch (err) {
      lastErr = err;
      logError(`ai:${req.task}`, err, { provider: provider.name, attempt });
      if (!(err instanceof AIError) || !err.retryable) break;
    }
  }
  if (lastErr instanceof AIError) throw lastErr;
  throw new AIError("erreur inattendue", "PROVIDER_ERROR");
}
