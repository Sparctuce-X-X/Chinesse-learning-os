import "server-only";
import { spawn } from "node:child_process";
import { copyFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { z } from "zod";
import { AIError, type AIProvider, type AIStatus, type StructuredRequest } from "../types";
import { extractJsonObject, toJsonSchema } from "../json-schema";

/**
 * Fournisseur « Claude Code CLI » : appelle `claude -p` en local.
 * Utilise l'abonnement Claude de l'utilisateur (aucune clé API nécessaire).
 * Chaque appel s'exécute dans un dossier temporaire isolé du projet.
 */
export class ClaudeCliProvider implements AIProvider {
  readonly name = "claude-cli";
  readonly label = "Claude (abonnement, via Claude Code)";
  private cachedStatus: { at: number; value: AIStatus } | null = null;

  constructor(
    private readonly bin = process.env.CLAUDE_CLI_PATH || "claude",
    private readonly models = {
      smart: process.env.CLAUDE_CLI_MODEL_SMART || "opus",
      fast: process.env.CLAUDE_CLI_MODEL_FAST || "haiku",
    },
  ) {}

  async status(): Promise<AIStatus> {
    if (this.cachedStatus && Date.now() - this.cachedStatus.at < 60_000) {
      return this.cachedStatus.value;
    }
    const value = await new Promise<AIStatus>((resolve) => {
      const child = spawn(this.bin, ["--version"], { stdio: ["ignore", "pipe", "pipe"] });
      let out = "";
      const timer = setTimeout(() => {
        child.kill("SIGKILL");
        resolve(this.unavailable("le CLI `claude` ne répond pas."));
      }, 10_000);
      child.stdout.on("data", (d) => (out += d));
      child.on("error", () => {
        clearTimeout(timer);
        resolve(this.unavailable("CLI `claude` introuvable. Installe Claude Code et connecte-toi (`claude` puis /login)."));
      });
      child.on("close", (code) => {
        clearTimeout(timer);
        if (code === 0) {
          resolve({ available: true, provider: this.name, label: `${this.label} — ${out.trim()}` });
        } else resolve(this.unavailable("le CLI `claude` a échoué."));
      });
    });
    this.cachedStatus = { at: Date.now(), value };
    return value;
  }

  private unavailable(reason: string): AIStatus {
    return { available: false, provider: this.name, label: this.label, reason };
  }

  async generate<S extends z.ZodTypeAny>(req: StructuredRequest<S>): Promise<z.output<S>> {
    const workdir = await mkdtemp(join(tmpdir(), "clos-ai-"));
    try {
      let prompt = req.prompt;
      const tools: string[] = [];
      if (req.pdfPath) {
        await copyFile(req.pdfPath, join(workdir, "cours.pdf"));
        tools.push("Read");
        prompt += `\n\nLe PDF original est disponible dans le fichier ./cours.pdf (outil Read, paramètre pages pour lire des pages précises).`;
      }
      const args = [
        "-p",
        "--output-format", "json",
        "--model", this.models[req.tier],
        "--json-schema", JSON.stringify(toJsonSchema(req.schema)),
        "--system-prompt", req.system,
        "--tools", tools.join(","),
        "--no-session-persistence",
        "--strict-mcp-config",
        "--restricted",
      ];
      if (tools.length) args.push("--allowedTools", tools.join(","));

      const raw = await this.run(args, prompt, workdir, req.timeoutMs);
      let envelope: { is_error?: boolean; result?: string; structured_output?: unknown; subtype?: string };
      try {
        envelope = JSON.parse(raw);
      } catch {
        throw new AIError("sortie du CLI illisible", "INVALID_OUTPUT", true);
      }
      if (envelope.is_error) {
        const msg = String(envelope.result ?? envelope.subtype ?? "erreur inconnue");
        if (/rate|limit|usage/i.test(msg)) throw new AIError(msg.slice(0, 200), "RATE_LIMITED");
        if (/log ?in|auth|credential/i.test(msg)) {
          throw new AIError("Claude Code n'est pas connecté. Lance `claude` puis /login.", "UNAVAILABLE");
        }
        throw new AIError(msg.slice(0, 200), "PROVIDER_ERROR", true);
      }
      let data: unknown = envelope.structured_output;
      if (data === undefined || data === null) {
        try {
          data = extractJsonObject(envelope.result ?? "");
        } catch {
          throw new AIError("réponse sans JSON", "INVALID_OUTPUT", true);
        }
      }
      const parsed = req.schema.safeParse(data);
      if (!parsed.success) {
        throw new AIError(`JSON non conforme (${parsed.error.issues[0]?.message ?? "?"})`, "INVALID_OUTPUT", true);
      }
      return parsed.data;
    } finally {
      await rm(workdir, { recursive: true, force: true }).catch(() => undefined);
    }
  }

  private run(args: string[], stdin: string, cwd: string, timeoutMs: number): Promise<string> {
    return new Promise((resolve, reject) => {
      const child = spawn(this.bin, args, { cwd, stdio: ["pipe", "pipe", "pipe"], env: process.env });
      let out = "";
      let err = "";
      const timer = setTimeout(() => {
        child.kill("SIGKILL");
        reject(new AIError("délai dépassé", "TIMEOUT", true));
      }, timeoutMs);
      child.stdout.on("data", (d) => (out += d));
      child.stderr.on("data", (d) => (err += d));
      child.on("error", (e) => {
        clearTimeout(timer);
        reject(new AIError(`CLI introuvable (${e.message})`, "UNAVAILABLE"));
      });
      child.on("close", (code) => {
        clearTimeout(timer);
        if (out.trim()) resolve(out);
        else reject(new AIError(`le CLI s'est arrêté (code ${code}) ${err.slice(0, 200)}`, "PROVIDER_ERROR", true));
      });
      child.stdin.end(stdin);
    });
  }
}
