/** Parcours mobile : navigation basse, session du jour, oral et conversation (IA simulée). */
import { expect, test } from "@playwright/test";

test("navigation mobile et session sur téléphone", async ({ page }) => {
  await page.goto("/");
  const nav = page.getByRole("navigation", { name: "Navigation principale" }).last();
  await expect(nav).toBeVisible();
  await nav.getByRole("link", { name: "Réviser" }).click();
  await expect(page.getByRole("heading", { name: "Réviser" })).toBeVisible();
  await nav.getByRole("link", { name: "Plus" }).click();
  await expect(page.getByRole("link", { name: /Connaissances/ })).toBeVisible();

  await page.goto("/reviser");
  // Après le parcours desktop, la journée est validée : on continue en « révisions seulement ».
  const start = page.getByRole("button", { name: /Commencer ma session|Encore un peu/ });
  const resume = page.getByRole("link", { name: /Reprendre ma session/ });
  if (await resume.count()) await resume.click();
  else if ((await start.count()) && (await start.isEnabled())) await start.click();
  else {
    // Rien de dû : on teste l'écran de session via les erreurs à retravailler.
    await page.goto("/erreurs");
    await page.getByRole("button", { name: "Retravailler mes erreurs" }).click();
  }
  await page.waitForURL(/\/session\/c/);
  await expect(page.locator("#exercise-instruction")).toBeVisible();
  // Grandes zones tactiles : bouton Valider d'au moins 44 px de haut.
  const box = await page.getByRole("button", { name: "Valider" }).boundingBox();
  expect(box!.height).toBeGreaterThanOrEqual(44);
  // Pas de défilement horizontal.
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});

test("oral en mode texte et conversation", async ({ page }) => {
  await page.goto("/oral");
  await page.getByRole("button", { name: "Écrire ma réponse" }).click();
  await page.locator("#transcript").fill("我喜欢用手机付款，只要有手机就可以。");
  await page.getByRole("button", { name: /Analyser ma réponse/ }).click();
  await expect(page.getByRole("button", { name: /Exercice suivant/ })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("Tu as dit")).toBeVisible();

  await page.goto("/conversation");
  await page.getByRole("button", { name: /Au restaurant/ }).click();
  await page.waitForURL(/\/conversation\/c/);
  await expect(page.getByText("你好！你想喝什么？")).toBeVisible();
  await page.locator("#message").fill("我想喝茶。");
  await page.getByRole("button", { name: "Envoyer" }).click();
  await expect(page.getByText("好的。你怎么付款？")).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: /Terminer et voir le bilan/ }).click();
  await expect(page.getByText("Bilan de la conversation")).toBeVisible({ timeout: 30_000 });
});
