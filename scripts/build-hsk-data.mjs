/**
 * Génère src/lib/chinese/hsk-data.json à partir de « complete-hsk-vocabulary »
 * (Yanis Zafirópulos, licence MIT) : https://github.com/drkameleon/complete-hsk-vocabulary
 *
 * Usage : node scripts/build-hsk-data.mjs <chemin/vers/complete.json>
 * Format de sortie : [mot, niveau HSK 3.0 (1–7, 7 = 7-9), rang de fréquence, pinyin, sens anglais].
 */
import { readFileSync, writeFileSync } from "node:fs";

const src = process.argv[2];
if (!src) {
  console.error("Usage : node scripts/build-hsk-data.mjs <complete.json>");
  process.exit(1);
}
const data = JSON.parse(readFileSync(src, "utf8"));
const level = (levels) => {
  for (const prefix of ["new-", "newest-", "old-"]) {
    const l = levels.find((x) => x.startsWith(prefix));
    if (l) return Math.min(7, Number(l.slice(prefix.length)));
  }
  return 7;
};
const rows = data
  .map((w) => {
    const f = w.forms[0] ?? {};
    const meanings = (f.meanings ?? []).slice(0, 3).join("; ");
    return [w.simplified, level(w.level), w.frequency ?? 999999, f.transcriptions?.pinyin ?? "", meanings.length > 90 ? meanings.slice(0, 87) + "…" : meanings];
  })
  .filter((r) => r[0]);
writeFileSync("src/lib/chinese/hsk-data.json", JSON.stringify(rows));
console.log(`${rows.length} mots écrits dans src/lib/chinese/hsk-data.json`);
