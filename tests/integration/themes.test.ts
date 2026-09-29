/**
 * Thèmes : rangement automatique incrémental (IA simulée), corrections de l'utilisateur
 * jamais écrasées, fusion et suppression sans perte de connaissances.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db/prisma";
import { getMockProvider } from "@/lib/ai";
import type { ClassifyThemesInput } from "@/lib/ai/tasks";
import {
  addItemToTheme,
  classifyPendingThemes,
  countUnclassified,
  createTheme,
  deleteTheme,
  getClassifyState,
  getTheme,
  listThemes,
  mergeThemes,
  removeItemFromTheme,
  renameTheme,
} from "@/server/themes";
import { getUserId } from "@/server/user";

const calls: ClassifyThemesInput[] = [];

async function vocab(hanzi: string, french: string) {
  const userId = await getUserId();
  const k = await prisma.knowledgeItem.create({
    data: {
      userId,
      type: "VOCABULARY",
      sourceType: "TEACHER",
      canonicalKey: `VOCABULARY:${hanzi}`,
      vocabulary: { create: { hanzi, french, frenchSource: "TEACHER" } },
    },
  });
  return k.id;
}

async function themesOf(id: string) {
  const links = await prisma.knowledgeTheme.findMany({ where: { knowledgeItemId: id }, include: { theme: true } });
  return links.map((l) => `${l.theme.name}:${l.source}`).sort();
}

beforeAll(() => {
  // Rangement déterministe : argent → « Argent et salaire », cuisine → « Cuisine », reste → « Divers test ».
  getMockProvider().register("classify-themes", (req) => {
    const input = req.mockContext as ClassifyThemesInput;
    calls.push(input);
    const existing = new Set(input.existingThemes.map((t) => t.name));
    const pick = (m: string | null) => (/salaire|argent/.test(m ?? "") ? ["Argent et salaire"] : /goûter|cuisine/.test(m ?? "") ? ["cuisine"] : ["Divers test"]);
    const assignments = input.items.map((i) => ({ id: i.id, themes: pick(i.meaning) }));
    const names = [...new Set(assignments.flatMap((a) => a.themes))].filter((n) => !existing.has(n));
    return { newThemes: names.map((name) => ({ name, emoji: "🧪", description: `Thème ${name}` })), assignments };
  });
});

describe("rangement automatique", () => {
  let salaire: string, gouter: string, clavier: string;

  it("range les éléments non rangés et crée les thèmes", async () => {
    salaire = await vocab("薪水", "salaire");
    gouter = await vocab("尝", "goûter");
    clavier = await vocab("键盘", "clavier");
    expect(await countUnclassified()).toBeGreaterThanOrEqual(3);
    await classifyPendingThemes();
    expect(getClassifyState().lastError).toBeNull();
    expect(await countUnclassified()).toBe(0);
    expect(await themesOf(salaire)).toEqual(["Argent et salaire:AI"]);
    // Nom normalisé (majuscule initiale).
    expect(await themesOf(gouter)).toEqual(["Cuisine:AI"]);
    // L'IA n'a reçu que des identifiants courts, jamais les identifiants de la base.
    expect(calls.at(-1)!.items.every((i) => /^e\d+$/.test(i.id))).toBe(true);
  });

  it("réutilise les thèmes existants pour un nouveau cours (incrémental)", async () => {
    const before = await prisma.theme.count();
    const annuel = await vocab("年薪", "salaire annuel");
    await classifyPendingThemes();
    expect(await prisma.theme.count()).toBe(before);
    expect(await themesOf(annuel)).toEqual(["Argent et salaire:AI"]);
    // Seul le nouvel élément est envoyé, avec la liste des thèmes existants.
    const last = calls.at(-1)!;
    expect(last.items.map((i) => i.hanzi)).toEqual(["年薪"]);
    expect(last.existingThemes.map((t) => t.name)).toContain("Argent et salaire");
  });

  it("ne touche jamais aux choix de l'utilisateur", async () => {
    const { id: tech } = await createTheme({ name: "informatique", emoji: "💻" });
    await addItemToTheme(clavier, tech);
    const divers = (await prisma.theme.findFirstOrThrow({ where: { name: "Divers test" } })).id;
    await removeItemFromTheme(clavier, divers);
    const n = calls.length;
    await classifyPendingThemes();
    expect(calls.length).toBe(n); // rien à ranger : pas d'appel IA
    expect(await themesOf(clavier)).toEqual(["Informatique:USER"]);
  });

  it("résume les thèmes avec leur progression", async () => {
    const { themes, unclassified } = await listThemes();
    const argent = themes.find((t) => t.name === "Argent et salaire")!;
    expect(argent.total).toBeGreaterThanOrEqual(2);
    expect(argent.isNew).toBe(argent.total);
    expect(unclassified).toBe(0);
    const detail = (await getTheme(argent.id))!;
    expect(detail.itemIds).toContain(salaire);
  });

  it("renomme, fusionne et supprime sans perdre de connaissances", async () => {
    const cuisine = (await prisma.theme.findFirstOrThrow({ where: { name: "Cuisine" } })).id;
    await renameTheme(cuisine, { name: "Cuisine et alimentation", emoji: "🍜" });
    expect((await prisma.theme.findUniqueOrThrow({ where: { id: cuisine } })).source).toBe("USER");
    await expect(renameTheme(cuisine, { name: "Argent et salaire" })).rejects.toThrow(/existe déjà/);

    const argent = (await prisma.theme.findFirstOrThrow({ where: { name: "Argent et salaire" } })).id;
    await mergeThemes(cuisine, argent);
    expect(await prisma.theme.findUnique({ where: { id: cuisine } })).toBeNull();
    expect(await themesOf(gouter)).toEqual(["Argent et salaire:AI"]);

    const items = await prisma.knowledgeItem.count();
    await deleteTheme(argent);
    expect(await prisma.knowledgeItem.count()).toBe(items);
    expect(await themesOf(salaire)).toEqual([]);
    expect((await listThemes()).unthemed).toBeGreaterThanOrEqual(3);
  });

  it("signale proprement l'absence d'IA", async () => {
    await vocab("春节", "Fête du Printemps");
    process.env.AI_MOCK_FAIL = "classify-themes";
    try {
      await classifyPendingThemes();
      expect(getClassifyState().lastError).toMatch(/IA/);
      expect(await countUnclassified()).toBe(1); // l'élément reste en attente, rien n'est perdu
    } finally {
      delete process.env.AI_MOCK_FAIL;
    }
    await classifyPendingThemes();
    expect(await countUnclassified()).toBe(0);
  });
});
