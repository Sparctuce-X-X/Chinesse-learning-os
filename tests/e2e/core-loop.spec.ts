/**
 * Parcours critique complet dans le navigateur :
 * import PDF → validation (avec corrections) → cours → connaissances → session
 * → réponses justes et fausses → erreurs → progression → persistance.
 *
 * L'IA est simulée (AI_PROVIDER=mock, bandeau visible) : son analyse repose sur
 * l'extraction heuristique locale du vrai PDF.
 */
import { expect, test, type Page } from "@playwright/test";
import { currentSpec, db, expectAccessible, PDF } from "./helpers";

test.describe.configure({ mode: "serial" });

async function answerCurrent(page: Page, sessionId: string, mode: "correct" | "wrong" | "dontknow") {
  const spec = await currentSpec(sessionId);
  if (!spec) return false;
  if (mode === "dontknow") {
    await page.getByRole("button", { name: "Je ne sais pas" }).click();
  } else if (spec.prompt.tiles) {
    const tiles = page.locator("button[lang=zh-CN]:not([aria-label])");
    if (mode === "wrong") {
      const n = spec.prompt.tiles.length;
      for (let k = n - 1; k >= 0; k--) await tiles.nth(k).click();
    } else {
      let rest = spec.answer.expected.replace(/[，。！？、；：“”,.!?\s]/g, "");
      const used = new Set<number>();
      while (rest.length) {
        const k = spec.prompt.tiles.findIndex((t, j) => !used.has(j) && rest.startsWith(t));
        used.add(k);
        rest = rest.slice(spec.prompt.tiles[k].length);
        await tiles.nth(k).click();
      }
    }
    await page.getByRole("button", { name: "Valider" }).click();
  } else if (spec.prompt.audioText && (await page.getByRole("button", { name: "Passer cet exercice" }).count())) {
    await page.getByRole("button", { name: "Passer cet exercice" }).click();
  } else {
    await page.locator("#answer").fill(mode === "wrong" ? (spec.answer.evaluation === "gloss" ? "voiture rouge" : "错字") : spec.answer.expected);
    await page.getByRole("button", { name: "Valider" }).click();
  }
  await expect(page.getByText(/Continuer|Terminer la session|Comment as-tu répondu/).first()).toBeVisible({ timeout: 20_000 });
  if (await page.getByText("Comment as-tu répondu").count()) {
    await page.getByRole("button", { name: mode === "correct" ? /J'avais bon/ : /Faux/ }).click();
    await expect(page.getByText(/Continuer|Terminer la session/).first()).toBeVisible();
  }
  return true;
}

test("écran vide : l'application propose d'importer un cours", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("Commence par importer un cours")).toBeVisible();
  await expect(page.getByText("Mode test : les réponses de l'IA sont simulées.")).toBeVisible();
  await page.goto("/connaissances");
  await expect(page.getByText("Ta base est vide")).toBeVisible();
  await page.goto("/erreurs");
  await expect(page.getByText("Aucune erreur ici")).toBeVisible();
});

test("import d'un fichier qui n'est pas un PDF : refus clair", async ({ page }) => {
  await page.goto("/cours/importer");
  await page.setInputFiles('[data-testid="pdf-input"]', { name: "notes.txt", mimeType: "text/plain", buffer: Buffer.from("bonjour") });
  await expect(page.getByText("Ce fichier n'est pas un PDF.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Importer et analyser" })).toBeDisabled();
});

test("import, correction et validation du vrai PDF", async ({ page }) => {
  await page.goto("/cours/importer");
  await page.setInputFiles('[data-testid="pdf-input"]', PDF);
  await page.getByRole("button", { name: "Importer et analyser" }).click();
  await expect(page.getByRole("button", { name: /Valider le cours/ })).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText("22 pages").first()).toBeVisible();
  await expectAccessible(page);

  // Corriger la traduction du premier mot (付款).
  const first = page.getByRole("article", { name: "付款" });
  await expect(first).toBeVisible();
  await first.getByRole("button", { name: "Modifier" }).click();
  await first.getByLabel("Français").fill("payer");
  await first.getByRole("button", { name: "Terminer" }).click();
  await expect(first).toContainText("payer");
  // Supprimer le deuxième (软件).
  await page.getByRole("article", { name: "软件" }).getByRole("button", { name: "Supprimer" }).click();
  await expect(page.getByRole("button", { name: "Restaurer" })).toBeVisible();

  await page.getByRole("button", { name: "Tout approuver" }).click();
  await page.getByRole("button", { name: /Valider le cours/ }).click();
  await expect(page.getByRole("button", { name: "Réviser ce cours" })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("付款").first()).toBeVisible();

  const fukuan = await db.vocabulary.findFirstOrThrow({ where: { hanzi: "付款" } });
  expect(fukuan.french).toBe("payer");
  expect(fukuan.frenchSource).toBe("USER");
  expect(await db.vocabulary.count({ where: { hanzi: "软件" } })).toBe(0);
});

test("historique des cours et base de connaissances", async ({ page }) => {
  await page.goto("/cours");
  await expect(page.getByText("Validé")).toBeVisible();
  await page.goto("/connaissances?q=fukuan");
  await expect(page.getByText("付款")).toBeVisible();
  await page.getByText("付款").first().click();
  await expect(page.getByRole("heading", { name: "付款" })).toBeVisible();
  await expect(page.getByText("page 10")).toBeVisible();
  await expect(page.getByText("Moi").first()).toBeVisible();
  await page.goto("/connaissances?filtre=grammar");
  await expect(page.getByText("万一").first()).toBeVisible();
});

test("session quotidienne avec erreurs volontaires, puis erreurs et progression", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Commencer ma session" }).click();
  await page.waitForURL(/\/session\/c/);
  const sessionId = page.url().split("/session/")[1];

  // Aucune réponse visible avant d'avoir répondu.
  const spec0 = await currentSpec(sessionId);
  expect(spec0).not.toBeNull();
  if (spec0!.answer.evaluation !== "gloss") {
    await expect(page.locator("main, body")).not.toContainText(spec0!.answer.expected);
  }

  await expectAccessible(page);
  await answerCurrent(page, sessionId, "wrong");
  await expect(page.getByText(/Incorrect/).first()).toBeVisible();
  await expect(page.getByText("Ta réponse")).toBeVisible();
  await expectAccessible(page);
  await page.getByRole("button", { name: /Continuer/ }).click();

  await answerCurrent(page, sessionId, "dontknow");
  await page.keyboard.press("Enter");

  for (let i = 0; i < 40; i++) {
    if (page.url().includes("/resume")) break;
    const ok = await answerCurrent(page, sessionId, "correct");
    if (!ok) break;
    await page.keyboard.press("Enter");
    await page.waitForTimeout(150);
  }
  await page.waitForURL(/\/resume/, { timeout: 30_000 });
  await expect(page.getByRole("heading", { name: "Session terminée" })).toBeVisible();
  await expect(page.getByText("À revoir bientôt")).toBeVisible();
  await expect(page.getByRole("heading", { name: "C'est bon pour aujourd'hui" })).toBeVisible();
  await expectAccessible(page);

  const session = await db.learningSession.findUniqueOrThrow({ where: { id: sessionId } });
  expect(session.completedAt).not.toBeNull();
  expect(session.mistakesCount).toBeGreaterThanOrEqual(1);
  const attempts = await db.reviewAttempt.count({ where: { sessionId } });
  expect(attempts).toBe(session.reviewsCompleted);

  // Les éléments réussis sont replanifiés dans le futur.
  const future = await db.reviewState.count({ where: { reps: { gt: 0 }, nextReviewAt: { gt: new Date() } } });
  expect(future).toBeGreaterThan(0);

  await page.getByRole("link", { name: "Voir mes erreurs" }).click();
  await expect(page.getByRole("heading", { name: "Mes erreurs" })).toBeVisible();
  await expect(page.getByText("Ta réponse").first()).toBeVisible();
  await expect(page.getByRole("button", { name: /Retravailler/ }).first()).toBeVisible();

  await page.goto("/progression");
  await expect(page.getByRole("heading", { name: "Cette semaine" })).toBeVisible();
  await expect(page.getByText("révisions").first()).toBeVisible();

  // Session du jour faite : l'accueil dit de s'arrêter et annonce la charge de demain.
  await page.goto("/");
  await expect(page.getByText("Journée validée ✓")).toBeVisible();
  await expect(page.getByText(/Reviens demain|Rien de prévu pour demain/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Commencer ma session" })).toHaveCount(0);
  await expectAccessible(page);
});

test("les erreurs influencent la session suivante (session « Retravailler »)", async ({ page }) => {
  const mistakes = await db.mistake.findMany({ where: { resolvedAt: null } });
  expect(mistakes.length).toBeGreaterThan(0);
  await page.goto("/erreurs");
  await page.getByRole("button", { name: "Retravailler mes erreurs" }).click();
  await page.waitForURL(/\/session\/c/);
  const sessionId = page.url().split("/session/")[1];
  const session = await db.learningSession.findUniqueOrThrow({ where: { id: sessionId } });
  const plan = session.plan as unknown as { knowledgeItemId: string; reason: string }[];
  const ids = new Set(mistakes.map((m) => m.knowledgeItemId));
  expect(plan.every((p) => ids.has(p.knowledgeItemId) && p.reason === "mistake")).toBe(true);
  await expect(page.getByText("Erreur à retravailler")).toBeVisible();
});

test("persistance : les données sont toujours là dans un nouveau contexte", async ({ browser }) => {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto("/cours");
  await expect(page.getByText("Validé")).toBeVisible();
  await page.goto("/connaissances");
  await expect(page.getByText(/\d+ éléments/)).toBeVisible();
  await ctx.close();
});

test("thèmes : mots rangés automatiquement, révision et rangement manuel", async ({ page }) => {
  await page.goto("/themes");
  // Le rangement est lancé en arrière-plan à la validation du cours.
  await expect(page.getByText("Rangement en cours…")).toBeHidden({ timeout: 20_000 });
  await page.reload();
  const card = page.getByRole("link", { name: /Autres sujets \(IA simulée\)/ });
  await expect(card).toBeVisible();
  await card.click();
  await expect(page.getByRole("heading", { level: 1, name: /Autres sujets/ })).toBeVisible();

  // Rangement manuel d'un mot dans un nouveau thème, depuis sa fiche.
  await page.locator("ul a[href^='/connaissances/']").first().click();
  await page.getByLabel("Ajouter à un thème").selectOption({ label: "Nouveau thème…" });
  await page.getByLabel("Nom du thème").fill("voyages");
  await page.getByRole("button", { name: "Ajouter" }).click();
  await expect(page.getByRole("link", { name: "Voyages" })).toBeVisible();
  await page.getByRole("link", { name: "Voyages" }).click();
  await expect(page.getByText("1 éléments").or(page.getByText("éléments"))).toBeVisible();

  await page.getByRole("button", { name: "Réviser ce thème" }).click();
  await page.waitForURL(/\/session\//);
});

test("ressources : texte collé, tri des mots, validation et révision", async ({ page }) => {
  await page.goto("/ressources");
  await expect(page.getByText("Aucune ressource pour l'instant")).toBeVisible();
  // Onglet Vidéo par défaut : un lien qui n'est pas YouTube est refusé proprement.
  await page.getByLabel("Lien de la vidéo YouTube").fill("https://example.com/video");
  await page.getByRole("button", { name: "Analyser les mots" }).click();
  await expect(page.getByText(/pas une vidéo YouTube/)).toBeVisible();
  await page.getByRole("tab", { name: "Texte" }).click();
  await page.getByLabel("Texte en chinois").fill(
    "现在很多年轻人觉得月薪不够花，所以开始做副业赚钱。有的人在网上开店，有的人晚上送外卖。副业虽然很累，但是可以多一份收入，也能学到新的技能。",
  );
  await page.getByLabel("Titre (facultatif)").fill("Les petits boulots");
  await page.getByRole("button", { name: "Analyser les mots" }).click();
  await page.waitForURL(/\/ressources\/[a-z0-9]+/);

  // Tri : taux de mots connus, mots proposés avec leur contexte.
  await expect(page.getByRole("heading", { name: /Mots nouveaux utiles/ })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("des mots du texte sont connus")).toBeVisible();
  const fuye = page.getByRole("checkbox", { name: /副业/ });
  await expect(fuye).toBeChecked();
  await expectAccessible(page);

  // « Je le connais » retire un mot ; décocher un mot l'exclut.
  const rows = page.locator("li").filter({ has: page.getByRole("checkbox") });
  const before = await rows.count();
  await rows.filter({ hasNot: page.getByRole("checkbox", { name: /副业/ }) }).first().getByRole("button", { name: /Je le connais/ }).click();
  await expect(rows).toHaveCount(before - 1);
  await fuye.uncheck();
  await fuye.check();

  const add = page.getByRole("button", { name: /Ajouter \d+ mots? à mes révisions/ });
  const label = (await add.textContent()) ?? "";
  const n = Number(/(\d+)/.exec(label)?.[1]);
  expect(n).toBeGreaterThan(0);
  await add.click();
  await expect(page.getByText(new RegExp(`${n} mots? ajoutés? à tes révisions`))).toBeVisible();
  await expect(page.getByText(`Mots appris avec cette ressource (${n})`)).toBeVisible();

  // Provenance : ressource externe, jamais la professeure.
  await page.locator("ul a[href^='/connaissances/']").first().click();
  await expect(page.getByText("Ressource externe")).toBeVisible();
  await page.goBack();

  // Les ressources restent hors de l'historique des cours.
  await page.goto("/cours");
  await expect(page.getByText("Les petits boulots")).toHaveCount(0);
  await page.goto("/ressources");
  await expect(page.getByRole("link", { name: /Les petits boulots/ })).toBeVisible();
  await page.getByRole("link", { name: /Les petits boulots/ }).click();
  await page.getByRole("button", { name: "Réviser ces mots" }).click();
  await page.waitForURL(/\/session\//);
});

test("paramètres : enregistrement des objectifs", async ({ page }) => {
  await page.goto("/parametres");
  await page.getByLabel("Prénom").fill("Dominique");
  await page.getByLabel("Durée cible d'une session (minutes)").fill("10");
  await page.getByRole("button", { name: "Enregistrer" }).click();
  await expect(page.getByText("Paramètres enregistrés.")).toBeVisible();
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /Dominique/ })).toBeVisible();
});

test("accessibilité des pages principales (WCAG 2 A/AA)", async ({ page }) => {
  for (const path of ["/", "/cours", "/connaissances", "/erreurs", "/progression", "/parametres", "/oral", "/conversation", "/reviser", "/plus", "/cours/importer", "/themes", "/ressources"]) {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    await expectAccessible(page);
  }
});
