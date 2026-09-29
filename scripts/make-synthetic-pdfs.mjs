/**
 * Génère des PDF SYNTHÉTIQUES (contenu fictif écrit pour les tests, pas des cours réels)
 * couvrant des formats que les futurs cours pourraient avoir.
 */
import { chromium } from "@playwright/test";
import { writeFileSync, readFileSync } from "node:fs";
const out = "tests/fixtures/synthetic";
const css = `body{font-family:"PingFang SC","Heiti SC",sans-serif;padding:40px;font-size:16px} td,th{border:1px solid #999;padding:6px 14px}`;
const docs = {
  "2026-09-24-notes-cours.pdf": `<h1>Cours du 24 septembre</h1>
<p>Thème : les voyages</p>
<p>旅行 - voyager</p>
<p>去年 - l'année dernière &nbsp;&nbsp; 已经 - déjà</p>
<p>终于 : enfin</p>
<p>我去年去了北京。</p>
<p>✗ 我去了北京去年 → 我去年去了北京</p>
<p>语法：去过 (expérience passée)</p>
<p>Structure : Sujet + 去过 + lieu</p>
<p>我去过上海。</p>
<p>(Je suis déjà allé à Shanghai.)</p>
<p>你去过中国吗？</p>`,
  "vocabulaire-tableau-francais.pdf": `<h2>生词 (Vocabulaire)</h2>
<table><tr><th>汉字</th><th>拼音 (Pinyin)</th><th>Français</th></tr>
<tr><td>机场</td><td>jī chǎng</td><td>aéroport</td></tr>
<tr><td>出租车</td><td>chū zū chē</td><td>taxi</td></tr>
<tr><td>下班</td><td>xià bān</td><td>finir le travail</td></tr>
<tr><td>行李</td><td>xíng li</td><td>bagages</td></tr></table>`,
};
const browser = await chromium.launch();
const page = await browser.newPage();
for (const [name, body] of Object.entries(docs)) {
  await page.setContent(`<html><head><meta charset="utf-8"><style>${css}</style></head><body>${body}</body></html>`);
  await page.pdf({ path: `${out}/${name}`, format: "A4" });
}
// PDF « scanné » : uniquement une image, sans couche texte.
await page.setContent(`<html><head><meta charset="utf-8"><style>${css}</style></head><body>${docs["vocabulaire-tableau-francais.pdf"]}</body></html>`);
const png = await page.screenshot({ fullPage: true });
await page.setContent(`<html><body style="margin:0"><img style="width:100%" src="data:image/png;base64,${png.toString("base64")}"></body></html>`);
await page.pdf({ path: `${out}/scan-sans-texte.pdf`, format: "A4" });
await browser.close();
// PDF corrompu : tronqué.
const good = readFileSync(`${out}/vocabulaire-tableau-francais.pdf`);
writeFileSync(`${out}/corrompu.pdf`, good.subarray(0, 400));
console.log("ok");
