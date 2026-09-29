/**
 * Range par thème les connaissances pas encore rangées (même traitement que l'application).
 * Usage : npm run classify-themes
 */
import { classifyPendingThemes, getClassifyState, listThemes } from "@/server/themes";

async function main() {
  const t0 = Date.now();
  await classifyPendingThemes();
  const state = getClassifyState();
  if (state.lastError) {
    console.error(`Échec : ${state.lastError}`);
    process.exit(1);
  }
  const { themes, unclassified, unthemed } = await listThemes();
  console.log(`${state.lastClassified} élément(s) rangé(s) en ${Math.round((Date.now() - t0) / 1000)} s.`);
  for (const t of themes) console.log(`${t.emoji ?? "🏷️"} ${t.name} — ${t.total}`);
  console.log(`Non rangés : ${unclassified} · sans thème : ${unthemed}`);
}

main().then(() => process.exit(0));
