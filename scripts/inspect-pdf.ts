/**
 * Aperçu local de l'extraction d'un PDF (sans IA, sans base de données) :
 *   npm run inspect-pdf -- "chemin/vers/cours.pdf"
 * Utile pour vérifier qu'un nouveau format de PDF est bien lu.
 */
import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { extractPdf } from "../src/lib/pdf/extract";
import { heuristicExtract } from "../src/lib/pdf/heuristic";

const file = process.argv[2];
if (!file) {
  console.error("Usage : npm run inspect-pdf -- <fichier.pdf>");
  process.exit(1);
}

extractPdf(new Uint8Array(readFileSync(file)))
  .then((r) => {
    const h = heuristicExtract({ filename: basename(file), pages: r.pages, pdfCreatedAt: r.pdfCreatedAt });
    console.log(`Pages : ${r.pageCount} · pages images : ${r.imagePages.join(", ") || "aucune"} · créé le ${r.pdfCreatedAt?.toISOString().slice(0, 10) ?? "?"}`);
    console.log(`Titre : ${h.lesson.title}${h.lesson.titleChinese ? ` (${h.lesson.titleChinese})` : ""} · date : ${h.lesson.date ?? "?"}`);
    console.log("\nVocabulaire :");
    for (const v of h.vocabulary) console.log(`  p.${v.sourcePage} ${v.hanzi}  ${v.pinyin ?? ""}  ${v.french ?? v.english ?? ""}`);
    console.log("\nGrammaire :");
    for (const g of h.grammarPoints) console.log(`  p.${g.sourcePage} ${g.name}  ${g.structure ?? ""}`);
    console.log("\nPhrases :");
    for (const s of h.sentences) console.log(`  p.${s.sourcePage} [${s.origin}] ${s.hanzi}`);
    console.log("\nCorrections :");
    for (const c of h.corrections) console.log(`  p.${c.sourcePage} ${c.incorrect} → ${c.correct}`);
    console.log("\nExercices :");
    for (const e of h.exercises) console.log(`  p.${e.sourcePage} [${e.type}] ${e.prompt}`);
    if (h.warnings.length) console.log("\nAvertissements :\n  " + h.warnings.join("\n  "));
  })
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
