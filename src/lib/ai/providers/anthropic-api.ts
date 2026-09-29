import "server-only";
import { readFile } from "node:fs/promises";
import Anthropic from "@anthropic-ai/sdk";
import type { z } from "zod";
import { AIError, type AIProvider, type AIStatus, type StructuredRequest } from "../types";
import { extractJsonObject, toJsonSchema } from "../json-schema";

/** Fournisseur API Anthropic (clé ANTHROPIC_API_KEY côté serveur uniquement). */
export class AnthropicApiProvider implements AIProvider {
  readonly name = "anthropic";
  readonly label = "API Anthropic (clé API)";
  private client: Anthropic | null = null;
  private readonly models = {
    smart: process.env.ANTHROPIC_MODEL_SMART || "claude-opus-5",
    fast: process.env.ANTHROPIC_MODEL_FAST || "claude-haiku-4-5",
  };

  async status(): Promise<AIStatus> {
    if (!process.env.ANTHROPIC_API_KEY) {
      return { available: false, provider: this.name, label: this.label, reason: "ANTHROPIC_API_KEY n'est pas définie." };
    }
    return { available: true, provider: this.name, label: this.label };
  }

  private getClient(): Anthropic {
    if (!this.client) this.client = new Anthropic({ maxRetries: 2 });
    return this.client;
  }

  async generate<S extends z.ZodTypeAny>(req: StructuredRequest<S>): Promise<z.output<S>> {
    if (!process.env.ANTHROPIC_API_KEY) throw new AIError("ANTHROPIC_API_KEY manquante", "UNAVAILABLE");
    const content: Anthropic.ContentBlockParam[] = [];
    if (req.pdfPath) {
      const data = (await readFile(req.pdfPath)).toString("base64");
      content.push({ type: "document", source: { type: "base64", media_type: "application/pdf", data } });
    }
    content.push({
      type: "text",
      text: `${req.prompt}\n\nRéponds uniquement avec un objet JSON conforme à ce schéma :\n${JSON.stringify(toJsonSchema(req.schema))}`,
    });

    let response: Anthropic.Message;
    try {
      response = await this.getClient().messages.create(
        {
          model: this.models[req.tier],
          max_tokens: req.tier === "smart" ? 16000 : 4000,
          system: req.system,
          messages: [{ role: "user", content }],
        },
        { timeout: req.timeoutMs },
      );
    } catch (err) {
      if (err instanceof Anthropic.RateLimitError) throw new AIError("limite atteinte", "RATE_LIMITED");
      if (err instanceof Anthropic.AuthenticationError) throw new AIError("clé API invalide", "UNAVAILABLE");
      if (err instanceof Anthropic.APIConnectionTimeoutError) throw new AIError("délai dépassé", "TIMEOUT", true);
      if (err instanceof Anthropic.APIError) throw new AIError(`API ${err.status ?? ""}`, "PROVIDER_ERROR", true);
      throw new AIError("erreur réseau", "PROVIDER_ERROR", true);
    }
    if (response.stop_reason === "refusal") throw new AIError("requête refusée par le modèle", "PROVIDER_ERROR");
    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");
    let data: unknown;
    try {
      data = extractJsonObject(text);
    } catch {
      throw new AIError("réponse sans JSON", "INVALID_OUTPUT", true);
    }
    const parsed = req.schema.safeParse(data);
    if (!parsed.success) throw new AIError("JSON non conforme", "INVALID_OUTPUT", true);
    return parsed.data;
  }
}
