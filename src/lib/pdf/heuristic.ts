/**
 * Extraction heuristique (sans IA) à partir du texte extrait page par page.
 *
 * Elle ne dépend pas d'un gabarit précis : elle repère des motifs génériques
 * (lignes « 汉字 + pinyin + glose », notes « 词 - sens », blocs « 语法 / Structure »,
 * phrases chinoises complètes). Tout résultat est à vérifier par l'utilisateur.
 */
import type {
  CorrectionExtraction,
  ExerciseExtraction,
  GrammarExtraction,
  LessonExtraction,
  SentenceExtraction,
  VocabularyExtraction,
} from "@/lib/ai/schemas";
import { containsHanzi, countHanzi, normalizeHanzi, segmentChinese } from "@/lib/chinese/text";
import { hasToneMarks, looksLikePinyin } from "@/lib/chinese/pinyin";

export interface HeuristicInput {
  filename: string;
  pages: { pageNumber: number; text: string; likelyImage: boolean }[];
  pdfCreatedAt: Date | null;
  pdfTitle?: string | null;
}

const HANZI_WORD = "[\\u3400-\\u9fff][\\u3400-\\u9fff…]*";

type GlossLang = "fr" | "en" | "unknown";

/** Langue probable d'une glose (fr / en / inconnue). */
export function glossLanguage(gloss: string): GlossLang {
  const g = gloss.toLowerCase();
  if (/[éèêëàâçùûôîïœ]/.test(g)) return "fr";
  if (/\b(le|la|les|une?|des|du|de|pour|avec|être|avoir|faire|école|ecole|enfin|aussi|très|mais|donc)\b/.test(g)) return "fr";
  if (/\b(to|the|of|and|an?|is|be|for|with)\b/.test(g) || /\w(ing|ly|ness|ful|ship|ization)\b/.test(g)) return "en";
  if (/\w(isation|ique|eux|euse|eur|ement)\b/.test(g) || /\b\w+(er|ez)\b/.test(g)) return "fr";
  return "unknown";
}

function isFrench(gloss: string): boolean {
  return glossLanguage(gloss) === "fr";
}

function glossFields(
  gloss: string,
  langHint: "en" | "fr" | null,
): Pick<VocabularyExtraction, "french" | "frenchSource" | "english" | "englishSource"> {
  const detected = glossLanguage(gloss);
  const lang = langHint ?? (detected === "fr" ? "fr" : "en");
  return lang === "fr"
    ? { french: gloss, frenchSource: "TEACHER", english: null, englishSource: null }
    : { french: null, frenchSource: null, english: gloss, englishSource: "TEACHER" };
}

function detectTableLang(line: string): "en" | "fr" | null {
  if (/english|英文|英语/i.test(line)) return "en";
  if (/fran[cç]ais|french|法语|法文/i.test(line)) return "fr";
  return null;
}

/** « 付款\tfù kuǎn\tto pay » ou « 付款  fù kuǎn  to pay ». */
function parseVocabRow(line: string): { hanzi: string; pinyin: string; gloss: string } | null {
  const cells = line.split(/\t| {2,}/).map((c) => c.trim()).filter(Boolean);
  if (cells.length >= 3 && containsHanzi(cells[0]) && countHanzi(cells[0]) <= 8) {
    const pinyinIdx = cells.findIndex((c, i) => i > 0 && looksLikePinyin(c) && hasToneMarks(c));
    if (pinyinIdx > 0) {
      const gloss = cells.slice(pinyinIdx + 1).join(" ").trim();
      if (gloss && !containsHanzi(gloss)) {
        return { hanzi: cells.slice(0, pinyinIdx).join(""), pinyin: cells[pinyinIdx], gloss };
      }
    }
  }
  // Variante sans tabulation : 汉字 pīnyīn glose
  const m = line.match(
    new RegExp(`^(${HANZI_WORD})\\s+([a-zA-Zāáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜü]+(?:\\s+[a-zA-Zāáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜü]+)*)\\s{2,}(.+)$`),
  );
  if (m && hasToneMarks(m[2]) && !containsHanzi(m[3])) {
    return { hanzi: m[1], pinyin: m[2], gloss: m[3].trim() };
  }
  return null;
}

const POS_RE = /^(?:(?:adj|adv|n|v|vt|vi|prep|conj|mw|num|pron|interj)\.\s*\/?\s*)+/i;
/** Mots qui ne terminent pas un mot glosé (« 的Linear » n'est pas du vocabulaire). */
const FUNCTION_ENDINGS = /[的了个一是在和也就把被着过吗呢吧啊]$/;

export interface InlineGloss {
  hanzi: string;
  gloss: string;
  partOfSpeech: string | null;
  /** Glose collée aux caractères, sans séparateur (« 庆祝celebrate ») : moins fiable. */
  attached: boolean;
  /** Portion de la ligne à retirer pour retrouver la phrase chinoise. */
  strip: string;
}

function splitPos(raw: string): { gloss: string; partOfSpeech: string | null } {
  const m = raw.match(POS_RE);
  if (!m) return { gloss: raw, partOfSpeech: null };
  return { gloss: raw.slice(m[0].length).trim(), partOfSpeech: m[0].replace(/\s+/g, "").replace(/\/$/, "") };
}

/** Dernier mot d'un segment chinois (« 我想庆祝 » → « 庆祝 »). */
function lastWord(chunk: string): string | null {
  const segs = segmentChinese(chunk).filter((x) => containsHanzi(x));
  if (!segs.length) return null;
  let w = segs[segs.length - 1];
  if ([...w].length === 1 && segs.length > 1) w = segs[segs.length - 2] + w;
  if (FUNCTION_ENDINGS.test(w) || [...w].length > 5) return null;
  return w;
}

/**
 * Gloses dans les notes libres :
 *  - avec séparateur : « 加入-join 社团- Association(ecole) », « 标准-adj./n.standard », « 全球化- Globalization … » ;
 *  - collées aux caractères : « 我想庆祝celebrate », « 开连锁店chain store ».
 */
export function parseInlineGlosses(line: string): InlineGloss[] {
  const out: InlineGloss[] = [];
  const taken: [number, number][] = [];
  const sep = new RegExp(
    `(${HANZI_WORD}(?:\\/${HANZI_WORD})?)\\s*[-–—:：=]\\s*([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ '’.()/\\-]*?)(?=\\s*…|\\s+[\\u3400-\\u9fff]|\\s{2,}|\\t|$|[，。,;；])`,
    "g",
  );
  for (const m of line.matchAll(sep)) {
    const { gloss, partOfSpeech } = splitPos(m[2].trim().replace(/[.\s]+$/, ""));
    if (gloss.length >= 2 && countHanzi(m[1]) <= 6) {
      out.push({ hanzi: m[1], gloss, partOfSpeech, attached: false, strip: m[0] });
      taken.push([m.index!, m.index! + m[0].length]);
    }
  }
  const attached = /([\u3400-\u9fff]+)([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ'’./]*(?: [a-z][A-Za-zÀ-ÿ'’]*){0,2})/g;
  for (const m of line.matchAll(attached)) {
    const start = m.index!;
    if (taken.some(([a, b]) => start < b && start + m[0].length > a)) continue;
    const word = lastWord(m[1]);
    if (!word) continue;
    const { gloss, partOfSpeech } = splitPos(m[2].replace(/[.\s]+$/, ""));
    if (gloss.length < 3) continue;
    out.push({ hanzi: word, gloss, partOfSpeech, attached: true, strip: m[2].replace(/[.\s]+$/, "") });
  }
  return out;
}

function guessDate(filename: string, pdfCreatedAt: Date | null): string | null {
  const iso = filename.match(/(20\d{2})[-_.](\d{1,2})[-_.](\d{1,2})/);
  if (iso) return `${iso[1]}-${iso[2].padStart(2, "0")}-${iso[3].padStart(2, "0")}`;
  const fr = filename.match(/(\d{1,2})[-_.](\d{1,2})[-_.](20\d{2})/);
  if (fr) return `${fr[3]}-${fr[2].padStart(2, "0")}-${fr[1].padStart(2, "0")}`;
  if (pdfCreatedAt) return pdfCreatedAt.toISOString().slice(0, 10);
  return null;
}

function guessTitle(input: HeuristicInput): { title: string; titleChinese: string | null } {
  const first = input.pages.find((p) => p.text.trim())?.text.split("\n") ?? [];
  let titleChinese: string | null = null;
  let title: string | null = null;
  const firstLine = first.find((l) => l.trim())?.trim() ?? "";
  for (const line of first.slice(0, 8)) {
    const t = line.trim();
    // Lignes à ignorer : tableaux, en-têtes de colonnes, notes « mot - sens ».
    if (!t || t.includes("\t") || /→|->|=>/.test(t) || /拼音|pinyin/i.test(t) || /[\u3400-\u9fff]\s*[-–—:：]\s*[A-Za-zÀ-ÿ]/.test(t)) continue;
    const shortHeading = t === firstLine && countHanzi(t) >= 2 && t.length <= 12;
    if (
      !titleChinese &&
      (countHanzi(t) >= 3 || shortHeading) &&
      t.length <= 20 &&
      !/[，,。？！]/.test(t) &&
      countHanzi(t) / t.replace(/\s/g, "").length > 0.6 &&
      !/^第.{1,3}课$/.test(t)
    ) {
      titleChinese = t;
    }
    const en = t.match(/^(?:lesson|leçon|lecon)\s*\d*\s*[:：-]\s*(.+)$/i);
    if (!title && en) title = en[1].trim();
    if (!title && /^(cours|leçon|lesson|class)\b/i.test(t) && t.length <= 80) title = t;
  }
  const fallback = input.pdfTitle || input.filename.replace(/\.pdf$/i, "").replace(/[_]+/g, " ").trim();
  return { title: title ?? titleChinese ?? fallback, titleChinese };
}

export function heuristicExtract(input: HeuristicInput): LessonExtraction {
  const vocabulary: VocabularyExtraction[] = [];
  const grammarPoints: GrammarExtraction[] = [];
  const sentences: SentenceExtraction[] = [];
  const corrections: CorrectionExtraction[] = [];
  const exercises: ExerciseExtraction[] = [];
  const warnings: string[] = [];
  const seenVocab = new Set<string>();
  const seenSentences = new Set<string>();

  const addVocab = (v: VocabularyExtraction) => {
    const key = normalizeHanzi(v.hanzi);
    if (!key || seenVocab.has(key)) return;
    seenVocab.add(key);
    vocabulary.push(v);
  };

  const firstPage = input.pages.find((p) => p.text.trim())?.pageNumber ?? 1;
  for (const page of input.pages) {
    const lines = page.text.split("\n").map((l) => l.trim()).filter(Boolean);
    let tableLang: "en" | "fr" | null = null;
    let inPractice = false;
    let currentGrammar: GrammarExtraction | null = null;

    for (let i = 0; i < lines.length; i++) {
      let line = lines[i];
      const next = lines[i + 1] ?? "";

      const headerLang = detectTableLang(line);
      if (headerLang && /拼音|pinyin/i.test(line)) {
        tableLang = headerLang;
        continue;
      }

      if (/^(practice|练习|exercice)\s*[:：]?/i.test(line)) {
        inPractice = true;
        continue;
      }

      // Bloc de grammaire
      const gram = line.match(/^(?:语法|grammaire|grammar)\s*[：:]\s*(.+)$/i);
      if (gram) {
        currentGrammar = {
          name: gram[1].trim(),
          structure: null,
          explanation: null,
          explanationSource: null,
          french: null,
          frenchSource: null,
          examples: [],
          sourcePage: page.pageNumber,
          sourceText: line,
          confidence: "MEDIUM",
        };
        grammarPoints.push(currentGrammar);
        inPractice = false;
        continue;
      }
      if (currentGrammar) {
        const st = line.match(/^(?:structure|结构)\s*[:：]\s*(.+)$/i);
        if (st) {
          currentGrammar.structure = st[1].trim();
          continue;
        }
        const me = line.match(/^(?:meaning|sens|意思|用法)\s*[:：]\s*(.+)$/i);
        if (me) {
          currentGrammar.explanation = me[1].trim();
          currentGrammar.explanationSource = "TEACHER";
          continue;
        }
        if (!inPractice && countHanzi(line) >= 4 && /[。？！?]$/.test(line)) {
          const tr = next.match(/^\((.+)\)$/);
          currentGrammar.examples.push({
            hanzi: line,
            pinyin: null,
            french: tr && isFrench(tr[1]) ? tr[1] : null,
            english: tr && !isFrench(tr[1]) ? tr[1] : null,
            source: "TEACHER",
            translationSource: tr ? "TEACHER" : null,
          });
          if (tr) i++;
          continue;
        }
      }

      // Ligne de tableau de vocabulaire
      const row = parseVocabRow(line);
      if (row) {
        addVocab({
          kind: countHanzi(row.hanzi) > 4 ? "EXPRESSION" : "VOCABULARY",
          hanzi: row.hanzi,
          pinyin: row.pinyin,
          pinyinSource: "TEACHER",
          ...glossFields(row.gloss, tableLang),
          partOfSpeech: null,
          notes: null,
          examples: [],
          sourcePage: page.pageNumber,
          sourceText: line,
          confidence: "HIGH",
          highlighted: false,
        });
        continue;
      }

      // Notes libres « 词 - sens »
      const inline = parseInlineGlosses(line);
      if (inline.length > 0) {
        for (const g of inline) {
          addVocab({
            kind: "VOCABULARY",
            hanzi: g.hanzi.split("/")[0],
            pinyin: null,
            pinyinSource: null,
            ...glossFields(g.gloss, null),
            partOfSpeech: g.partOfSpeech,
            notes: g.hanzi.includes("/") ? `Variante notée : ${g.hanzi}` : null,
            examples: [],
            sourcePage: page.pageNumber,
            sourceText: line,
            confidence: "LOW",
            highlighted: false,
          });
        }
        // Une phrase annotée (« 我想庆祝celebrate我的成绩。 ») reste aussi une phrase, sans les annotations.
        const cleaned = inline
          .reduce((acc, g) => acc.replace(g.strip, " "), line)
          .replace(/\s*…\s*/g, " ")
          .replace(/\s{2,}/g, " ")
          .replace(/\s+([，。？！,.?!])/g, "$1")
          .replace(/([\u3400-\u9fff])\s+(?=[\u3400-\u9fff])/g, "$1")
          .trim();
        if (!(countHanzi(cleaned) >= 8 && /[。？！?]/.test(cleaned))) continue;
        line = cleaned;
      }

      // Correction explicite « ✗ … → ✓ … » / « 错 … 对 … »
      const corr = line.match(/^(?:[✗✘×xX❌]|错[：:]?|incorrect\s*[:：])?\s*(.+?)\s*(?:→|->|=>|➜|⇒|✓|✔|对[：:])\s*[✓✔]?\s*(.+)$/);
      if (corr && containsHanzi(corr[1]) && containsHanzi(corr[2])) {
        corrections.push({
          incorrect: corr[1].trim(),
          correct: corr[2].replace(/^✓\s*/, "").trim(),
          explanation: null,
          explanationSource: null,
          context: null,
          sourcePage: page.pageNumber,
          confidence: "MEDIUM",
        });
        continue;
      }

      const hz = countHanzi(line);
      // Exercice à trou
      if (hz >= 2 && /_{3,}/.test(line)) {
        exercises.push({
          type: "FILL_BLANK",
          prompt: line,
          answer: null,
          context: lines[i - 1] && containsHanzi(lines[i - 1]) ? lines[i - 1] : null,
          sourcePage: page.pageNumber,
        });
        continue;
      }
      // Questions de compréhension numérotées « 1. …？（mots-indices） »
      if (hz >= 4 && /^\d+\s*[.、)]/.test(line) && /[？?]|（[^）]+）\s*$/.test(line)) {
        exercises.push({
          type: "COMPREHENSION",
          prompt: line.replace(/^\d+\s*[.、)]\s*/, ""),
          answer: null,
          context: null,
          sourcePage: page.pageNumber,
        });
        continue;
      }
      // Questions de discussion
      if (hz >= 4 && /[？?]\s*$/.test(line.replace(/\([^)]*\)\s*$/, "").trim())) {
        exercises.push({
          type: "DISCUSSION",
          prompt: line,
          answer: null,
          context: /^\(.+\)$/.test(next) ? next.slice(1, -1) : null,
          sourcePage: page.pageNumber,
        });
        continue;
      }

      // Phrases chinoises complètes
      const isHeading = /^[\u3400-\u9fff]{2,4}\s*[：:]/.test(line) || /^第.{1,3}课/.test(line);
      const isTitle = page.pageNumber === firstPage && countHanzi(line) === hz && !/[。？！]/.test(line);
      if (hz >= 5 && !isHeading && !isTitle && !line.includes("\t") && !/[:：]$/.test(line)) {
        const chineseRatio = hz / line.replace(/\s/g, "").length;
        if (chineseRatio < 0.5 && !inPractice) continue;
        const key = normalizeHanzi(line);
        if (seenSentences.has(key)) continue;
        seenSentences.add(key);
        const tr = next.match(/^\((.+)\)$/);
        sentences.push({
          hanzi: line,
          pinyin: null,
          pinyinSource: null,
          french: tr && isFrench(tr[1]) ? tr[1] : null,
          frenchSource: tr && isFrench(tr[1]) ? "TEACHER" : null,
          english: tr && !isFrench(tr[1]) ? tr[1] : null,
          englishSource: tr && !isFrench(tr[1]) ? "TEACHER" : null,
          origin: inPractice ? "STUDENT_PRACTICE" : chineseRatio < 0.8 ? "TEACHER_NOTE" : "TEACHER_MATERIAL",
          sourcePage: page.pageNumber,
          confidence: inPractice ? "LOW" : "MEDIUM",
        });
        if (tr) i++;
      }
    }
  }

  const imagePages = input.pages.filter((p) => p.likelyImage).map((p) => p.pageNumber);
  if (imagePages.length > 0) {
    warnings.push(
      `${imagePages.length} page(s) semblent être des images (p. ${imagePages.join(", ")}) : leur contenu n'a pas pu être lu sans IA.`,
    );
  }
  if (vocabulary.length === 0 && sentences.length === 0 && grammarPoints.length === 0) {
    warnings.push("Aucun contenu n'a été reconnu automatiquement. Ajoute les éléments manuellement.");
  }
  warnings.push("Extraction simple sans IA : vérifie chaque élément avant de valider.");

  const { title, titleChinese } = guessTitle(input);
  return {
    lesson: {
      title,
      titleChinese,
      date: guessDate(input.filename, input.pdfCreatedAt),
      topics: [],
      summary: null,
    },
    vocabulary,
    grammarPoints,
    sentences,
    corrections,
    exercises,
    warnings,
  };
}
