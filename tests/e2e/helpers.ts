import { PrismaClient } from "@prisma/client";

/** Accès direct à la base E2E (lecture des réponses attendues, vérification de la persistance). */
export const db = new PrismaClient({ datasources: { db: { url: "file:./e2e.db" } } });

export interface PlanEntry {
  knowledgeItemId: string;
  type: string;
  prompt: { tiles: string[] | null; audioText: string | null };
  answer: { expected: string; evaluation: string };
}

export async function currentSpec(sessionId: string): Promise<PlanEntry | null> {
  const s = await db.learningSession.findUniqueOrThrow({ where: { id: sessionId } });
  const plan = s.plan as unknown as PlanEntry[];
  return plan[s.currentIndex] ?? null;
}

export const PDF = "source-materials/pdf/L1 Dmn- Mobile Payment.pdf";

import AxeBuilder from "@axe-core/playwright";
import { expect, type Page } from "@playwright/test";

/** Audit d'accessibilité WCAG 2 A/AA (axe-core) de la page courante. */
export async function expectAccessible(page: Page) {
  // Contrastes mesurés hors animation (l'application respecte prefers-reduced-motion).
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.waitForTimeout(100);
  const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).exclude("nextjs-portal").analyze();
  const summary = r.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).slice(0, 3).join(" | ")}`);
  expect(summary).toEqual([]);
}
