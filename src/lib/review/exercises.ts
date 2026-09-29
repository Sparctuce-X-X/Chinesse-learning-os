/**
 * Génération d'exercices à partir d'une connaissance (fonctions pures).
 * Un exercice est « sûr » pour le client : la réponse est séparée (`answer`)
 * et n'est jamais envoyée au navigateur avant la tentative.
 */
import { z } from "zod";
import { containsHanzi, normalizeHanzi, segmentChinese } from "@/lib/chinese/text";
import type { Dimension } from "./scheduler";

export const ExerciseTypeSchema = z.enum([
  "RECOGNITION",
  "PRODUCTION",
  "PINYIN",
  "LISTENING",
  "LISTENING_MEANING",
  "FILL_BLANK",
  "SENTENCE_RECONSTRUCTION",
  "TRANSLATION",
  "GRAMMAR",
  "SPEAKING",
  "TONE",
]);
export type ExerciseType = z.infer<typeof ExerciseTypeSchema>;

export const EvaluationModeSchema = z.enum(["hanzi", "pinyin", "gloss", "order", "open"]);
export type EvaluationMode = z.infer<typeof EvaluationModeSchema>;

export const ExerciseSpecSchema = z.object({
  key: z.string(),
  knowledgeItemId: z.string(),
  type: ExerciseTypeSchema,
  dimension: z.enum(["RECOGNITION", "PRODUCTION", "LISTENING", "PRONUNCIATION", "USAGE"]),
  reason: z.enum(["new", "due", "mistake", "relearn", "prep", "extra"]),
  prompt: z.object({
    instruction: z.string(),
    /** Élément affiché (mot chinois, glose française, phrase à trou…). */
    display: z.string().nullable(),
    displayIsChinese: z.boolean(),
    hint: z.string().nullable(),
    /** Texte à lire par synthèse vocale (exercices d'écoute). */
    audioText: z.string().nullable(),
    tiles: z.array(z.string()).nullable(),
    inputPlaceholder: z.string().nullable(),
  }),
  answer: z.object({
    evaluation: EvaluationModeSchema,
    expected: z.string(),
    alternatives: z.array(z.string()),
    hanzi: z.string().nullable(),
    pinyin: z.string().nullable(),
    french: z.string().nullable(),
    english: z.string().nullable(),
    note: z.string().nullable(),
  }),
});
export type ExerciseSpec = z.infer<typeof ExerciseSpecSchema>;
export type PublicExercise = Omit<ExerciseSpec, "answer">;

export function toPublic(spec: ExerciseSpec): PublicExercise {
  const { answer: _answer, ...rest } = spec;
  void _answer;
  return rest;
}

export const EXERCISE_LABEL: Record<ExerciseType, string> = {
  RECOGNITION: "Chinois → français",
  PRODUCTION: "Français → chinois",
  PINYIN: "Pinyin",
  LISTENING: "Écoute",
  LISTENING_MEANING: "Compréhension orale",
  FILL_BLANK: "Phrase à trou",
  SENTENCE_RECONSTRUCTION: "Reconstruction",
  TRANSLATION: "Traduction",
  GRAMMAR: "Grammaire",
  SPEAKING: "Oral",
  TONE: "Tons",
};

// ─── Données d'entrée ─────────────────────────────────────────────────────────

export interface KnowledgeForExercise {
  id: string;
  type: "VOCABULARY" | "EXPRESSION" | "SENTENCE" | "GRAMMAR";
  hanzi: string | null;
  pinyin: string | null;
  french: string | null;
  english: string | null;
  grammar: { name: string; structure: string | null; explanation: string | null } | null;
  examples: { hanzi: string; pinyin: string | null; french: string | null; english: string | null }[];
  reps: number;
  scores: { recognition: number; production: number; listening: number };
  /** Catégories d'erreurs actives sur cette connaissance. */
  mistakeCategories: string[];
}

export interface GenerateOptions {
  reason: ExerciseSpec["reason"];
  /** Types récemment utilisés pour cet élément (pour varier). */
  recentTypes?: ExerciseType[];
  /** Autoriser les exercices d'écoute (synthèse vocale). */
  listening?: boolean;
  forceType?: ExerciseType;
  seed?: number;
}

function meaning(k: Pick<KnowledgeForExercise, "french" | "english">): string | null {
  return k.french || k.english || null;
}

function meaningLabel(k: Pick<KnowledgeForExercise, "french" | "english">): string {
  if (k.french) return k.french;
  return k.english ? `${k.english} (en anglais)` : "";
}

/** Repère la structure grammaticale : « 只要…就… » → ["只要", "就"]. */
export function grammarMarkers(name: string, structure?: string | null): string[] {
  const src = containsHanzi(name) ? name : structure ?? name;
  const cleaned = src.replace(/\([^)]*\)|（[^）]*）/g, " ");
  return cleaned
    .split(/\.{2,}|…+|\+|\s|～|~|[A-Za-z]+|，|,|\/|：|:/)
    .map((s) => s.trim())
    .filter((s) => containsHanzi(s))
    .map((s) => s.replace(/[^㐀-鿿]/g, ""))
    .filter(Boolean);
}

/** Remplace chaque marqueur par un trou dans une phrase ; null si un marqueur manque. */
export function blankMarkers(sentence: string, markers: string[]): string | null {
  let out = sentence;
  let from = 0;
  for (const m of markers) {
    const idx = out.indexOf(m, from);
    if (idx === -1) return null;
    out = out.slice(0, idx) + "＿＿" + out.slice(idx + m.length);
    from = idx + 2;
  }
  return out;
}

function seededShuffle<T>(arr: T[], seed: number): T[] {
  const a = [...arr];
  let s = seed || 1;
  for (let i = a.length - 1; i > 0; i--) {
    s = (s * 9301 + 49297) % 233280;
    const j = Math.floor((s / 233280) * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  // Évite de rendre la bonne réponse dans l'ordre.
  if (a.join("") === arr.join("") && a.length > 1) a.push(a.shift()!);
  return a;
}

function hashSeed(s: string): number {
  let h = 0;
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) % 100_000;
  return h;
}

// ─── Choix du type d'exercice ─────────────────────────────────────────────────

export function candidateTypes(k: KnowledgeForExercise, listening: boolean): ExerciseType[] {
  const hasMeaning = !!meaning(k);
  switch (k.type) {
    case "VOCABULARY":
    case "EXPRESSION": {
      const t: ExerciseType[] = [];
      if (hasMeaning) t.push("RECOGNITION", "PRODUCTION");
      if (k.pinyin) t.push("PINYIN");
      if (k.hanzi && k.examples.some((e) => e.hanzi.includes(k.hanzi!) && normalizeHanzi(e.hanzi) !== normalizeHanzi(k.hanzi!))) {
        t.push("FILL_BLANK");
      }
      if (listening && k.hanzi) t.push("LISTENING");
      return t;
    }
    case "SENTENCE": {
      const t: ExerciseType[] = [];
      if (k.hanzi && segmentChinese(k.hanzi).length >= 3) t.push("SENTENCE_RECONSTRUCTION");
      if (hasMeaning) t.push("TRANSLATION");
      if (listening && k.hanzi && hasMeaning) t.push("LISTENING_MEANING");
      if (listening && k.hanzi) t.push("LISTENING");
      return t;
    }
    case "GRAMMAR":
      return ["GRAMMAR"];
  }
}

const MISTAKE_TO_TYPE: Record<string, ExerciseType[]> = {
  TONE: ["PINYIN"],
  PINYIN: ["PINYIN"],
  MEANING: ["RECOGNITION", "TRANSLATION"],
  CHARACTER: ["PRODUCTION", "FILL_BLANK"],
  WORD_ORDER: ["SENTENCE_RECONSTRUCTION"],
  GRAMMAR: ["GRAMMAR", "TRANSLATION"],
  LISTENING: ["LISTENING", "LISTENING_MEANING"],
  USAGE: ["FILL_BLANK", "TRANSLATION"],
};

export function chooseType(k: KnowledgeForExercise, opts: GenerateOptions): ExerciseType | null {
  const candidates = candidateTypes(k, !!opts.listening);
  if (candidates.length === 0) return null;
  if (opts.forceType && candidates.includes(opts.forceType)) return opts.forceType;

  // Erreur active → exercice qui cible la faiblesse.
  for (const cat of k.mistakeCategories) {
    const target = (MISTAKE_TO_TYPE[cat] ?? []).find((t) => candidates.includes(t));
    if (target && !(opts.recentTypes ?? []).slice(-1).includes(target)) return target;
  }

  if (k.type === "VOCABULARY" || k.type === "EXPRESSION") {
    // 1re fois : reconnaissance ; ensuite on privilégie la production (rappel actif).
    if (k.reps === 0 && candidates.includes("RECOGNITION")) return "RECOGNITION";
    if (k.reps === 1 && candidates.includes("PRODUCTION")) return "PRODUCTION";
  }
  if (k.type === "SENTENCE" && k.reps === 0 && candidates.includes("SENTENCE_RECONSTRUCTION")) {
    return "SENTENCE_RECONSTRUCTION";
  }

  const recent = new Set((opts.recentTypes ?? []).slice(-2));
  const score = (t: ExerciseType): number => {
    const base: Record<ExerciseType, number> = {
      PRODUCTION: 100 - k.scores.production + 15,
      TRANSLATION: 100 - k.scores.production + 15,
      RECOGNITION: 100 - k.scores.recognition,
      PINYIN: 100 - (k.scores.production + k.scores.recognition) / 2,
      FILL_BLANK: 100 - k.scores.production,
      SENTENCE_RECONSTRUCTION: 100 - k.scores.production - 5,
      LISTENING: 100 - k.scores.listening,
      LISTENING_MEANING: 100 - k.scores.listening,
      GRAMMAR: 50,
      SPEAKING: 0,
      TONE: 0,
    };
    return base[t] - (recent.has(t) ? 40 : 0);
  };
  return [...candidates].sort((a, b) => score(b) - score(a))[0];
}

const DIMENSION_OF: Record<ExerciseType, Dimension> = {
  RECOGNITION: "RECOGNITION",
  PRODUCTION: "PRODUCTION",
  PINYIN: "PRONUNCIATION",
  TONE: "PRONUNCIATION",
  LISTENING: "LISTENING",
  LISTENING_MEANING: "LISTENING",
  FILL_BLANK: "USAGE",
  SENTENCE_RECONSTRUCTION: "USAGE",
  TRANSLATION: "PRODUCTION",
  GRAMMAR: "USAGE",
  SPEAKING: "USAGE",
};

export function dimensionOf(type: ExerciseType): Dimension {
  return DIMENSION_OF[type];
}

// ─── Construction de l'exercice ───────────────────────────────────────────────

export function generateExercise(k: KnowledgeForExercise, opts: GenerateOptions): ExerciseSpec | null {
  const type = chooseType(k, opts);
  if (!type) return null;
  return buildExercise(k, type, opts);
}

export function buildExercise(k: KnowledgeForExercise, type: ExerciseType, opts: GenerateOptions): ExerciseSpec | null {
  const seed = opts.seed ?? hashSeed(k.id + type);
  const key = `${k.id}:${type}:${seed}`;
  const base = {
    key,
    knowledgeItemId: k.id,
    type,
    dimension: dimensionOf(type),
    reason: opts.reason,
  };
  const answerBase = {
    hanzi: k.hanzi,
    pinyin: k.pinyin,
    french: k.french,
    english: k.english,
    note: null as string | null,
  };
  const prompt = {
    display: null as string | null,
    displayIsChinese: false,
    hint: null as string | null,
    audioText: null as string | null,
    tiles: null as string[] | null,
    inputPlaceholder: null as string | null,
  };
  const glosses = [k.french, k.english].filter((g): g is string => !!g);

  switch (type) {
    case "RECOGNITION":
      if (!k.hanzi || !glosses.length) return null;
      return {
        ...base,
        prompt: { ...prompt, instruction: "Que signifie ce mot ?", display: k.hanzi, displayIsChinese: true, inputPlaceholder: "Sens en français" },
        answer: { ...answerBase, evaluation: "gloss", expected: meaning(k)!, alternatives: glosses },
      };
    case "PRODUCTION":
      if (!k.hanzi || !glosses.length) return null;
      return {
        ...base,
        prompt: {
          ...prompt,
          instruction: "Comment dit-on en chinois :",
          display: `« ${meaningLabel(k)} »`,
          inputPlaceholder: "汉字 ou pinyin",
        },
        answer: { ...answerBase, evaluation: "hanzi", expected: k.hanzi, alternatives: [] },
      };
    case "PINYIN":
      if (!k.hanzi || !k.pinyin) return null;
      return {
        ...base,
        prompt: {
          ...prompt,
          instruction: "Quel est le pinyin (avec les tons) de :",
          display: k.hanzi,
          displayIsChinese: true,
          hint: "Tu peux écrire les tons en chiffres : lv3 xing2",
          inputPlaceholder: "pīnyīn ou pin1yin1",
        },
        answer: { ...answerBase, evaluation: "pinyin", expected: k.pinyin, alternatives: [] },
      };
    case "FILL_BLANK": {
      if (!k.hanzi) return null;
      const ex = k.examples.find((e) => e.hanzi.includes(k.hanzi!) && normalizeHanzi(e.hanzi) !== normalizeHanzi(k.hanzi!));
      if (!ex) return null;
      const blanked = ex.hanzi.split(k.hanzi).join("＿＿");
      return {
        ...base,
        prompt: {
          ...prompt,
          instruction: "Complète la phrase :",
          display: blanked,
          displayIsChinese: true,
          hint: meaning(ex) ? `« ${ex.french ?? ex.english} »` : meaning(k) ? `Indice : ${meaningLabel(k)}` : null,
          inputPlaceholder: "汉字 ou pinyin",
        },
        answer: {
          ...answerBase,
          evaluation: "hanzi",
          expected: k.hanzi,
          alternatives: [],
          note: ex.hanzi,
        },
      };
    }
    case "SENTENCE_RECONSTRUCTION": {
      if (!k.hanzi) return null;
      // Les signes de ponctuation ne sont pas des tuiles : on compare le texte normalisé.
      const tiles = segmentChinese(k.hanzi).filter((t) => normalizeHanzi(t).length > 0);
      if (tiles.length < 3) return null;
      return {
        ...base,
        prompt: {
          ...prompt,
          instruction: "Remets les éléments dans le bon ordre :",
          display: meaning(k) ? `« ${meaningLabel(k)} »` : null,
          tiles: seededShuffle(tiles, seed),
        },
        answer: { ...answerBase, evaluation: "order", expected: k.hanzi, alternatives: [] },
      };
    }
    case "TRANSLATION":
      if (!k.hanzi || !glosses.length) return null;
      return {
        ...base,
        prompt: {
          ...prompt,
          instruction: "Traduis en chinois :",
          display: `« ${meaningLabel(k)} »`,
          inputPlaceholder: "Ta phrase en chinois",
        },
        answer: { ...answerBase, evaluation: "open", expected: k.hanzi, alternatives: [] },
      };
    case "LISTENING":
      if (!k.hanzi) return null;
      return {
        ...base,
        prompt: {
          ...prompt,
          instruction: "Écoute et écris ce que tu entends :",
          audioText: k.hanzi,
          inputPlaceholder: "汉字 ou pinyin",
        },
        answer: { ...answerBase, evaluation: "hanzi", expected: k.hanzi, alternatives: [] },
      };
    case "LISTENING_MEANING":
      if (!k.hanzi || !glosses.length) return null;
      return {
        ...base,
        prompt: {
          ...prompt,
          instruction: "Écoute : que signifie cette phrase ?",
          audioText: k.hanzi,
          inputPlaceholder: "Sens en français",
        },
        answer: { ...answerBase, evaluation: "gloss", expected: meaning(k)!, alternatives: glosses },
      };
    case "GRAMMAR": {
      if (!k.grammar) return null;
      const markers = grammarMarkers(k.grammar.name, k.grammar.structure);
      const explanation = k.grammar.explanation ? ` — ${k.grammar.explanation}` : "";
      const example = markers.length
        ? k.examples.find((e) => blankMarkers(e.hanzi, markers) !== null)
        : undefined;
      if (example) {
        return {
          ...base,
          prompt: {
            ...prompt,
            instruction: `Complète avec la bonne structure${explanation ? ` (${k.grammar.explanation})` : ""} :`,
            display: blankMarkers(example.hanzi, markers),
            displayIsChinese: true,
            hint: example.french || example.english ? `« ${example.french ?? example.english} »` : null,
            inputPlaceholder: markers.length > 1 ? "Mots séparés par un espace" : "汉字",
          },
          answer: {
            ...answerBase,
            hanzi: k.grammar.name,
            pinyin: example.pinyin,
            french: example.french,
            english: example.english,
            evaluation: "hanzi",
            expected: markers.join(" "),
            alternatives: [],
            note: example.hanzi,
          },
        };
      }
      return {
        ...base,
        prompt: {
          ...prompt,
          instruction: "Fais une phrase en chinois avec cette structure :",
          display: k.grammar.name,
          displayIsChinese: containsHanzi(k.grammar.name),
          hint: k.grammar.structure ? `Structure : ${k.grammar.structure}${explanation}` : explanation.slice(3) || null,
          inputPlaceholder: "Ta phrase",
        },
        answer: {
          ...answerBase,
          hanzi: k.grammar.name,
          evaluation: "open",
          expected: k.examples[0]?.hanzi ?? k.grammar.name,
          alternatives: [],
          note: k.grammar.structure,
        },
      };
    }
    default:
      return null;
  }
}
