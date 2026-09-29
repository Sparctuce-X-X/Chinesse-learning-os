import { z } from "zod";

/**
 * Provenance d'une donnée : lue dans le PDF (TEACHER), produite par l'IA (AI),
 * saisie / corrigée par l'utilisateur (USER — jamais produit par l'extraction)
 * ou issue d'une ressource externe ou d'un dictionnaire (EXTERNAL).
 */
export const ProvenanceSchema = z.enum(["TEACHER", "AI", "USER", "EXTERNAL"]);
export const ConfidenceSchema = z.enum(["HIGH", "MEDIUM", "LOW"]);

const str = z.string().trim();
const optStr = z
  .string()
  .nullish()
  .transform((v) => (v && v.trim() ? v.trim() : null));
const optProv = ProvenanceSchema.nullish().transform((v) => v ?? null);
const optPage = z
  .number()
  .int()
  .positive()
  .nullish()
  .transform((v) => v ?? null);

export const ExampleExtractionSchema = z.object({
  hanzi: str.min(1),
  pinyin: optStr,
  french: optStr,
  english: optStr,
  /** Provenance du texte chinois de l'exemple. */
  source: ProvenanceSchema.default("TEACHER"),
  /** Provenance de la traduction (AI si elle a été produite par l'IA). */
  translationSource: optProv,
});

export const VocabularyExtractionSchema = z.object({
  kind: z.enum(["VOCABULARY", "EXPRESSION"]).default("VOCABULARY"),
  hanzi: str.min(1),
  pinyin: optStr,
  pinyinSource: optProv,
  french: optStr,
  frenchSource: optProv,
  english: optStr,
  englishSource: optProv,
  partOfSpeech: optStr,
  notes: optStr,
  examples: z.array(ExampleExtractionSchema).default([]),
  sourcePage: optPage,
  sourceText: optStr,
  confidence: ConfidenceSchema.default("MEDIUM"),
  highlighted: z.boolean().nullish().transform((v) => v ?? false),
});

export const GrammarExtractionSchema = z.object({
  name: str.min(1),
  structure: optStr,
  explanation: optStr,
  explanationSource: optProv,
  french: optStr,
  frenchSource: optProv,
  examples: z.array(ExampleExtractionSchema).default([]),
  sourcePage: optPage,
  sourceText: optStr,
  confidence: ConfidenceSchema.default("MEDIUM"),
});

export const SentenceOriginSchema = z.enum([
  "TEACHER_MATERIAL",
  "TEACHER_NOTE",
  "DIALOGUE",
  "STUDENT_PRACTICE",
]);

export const SentenceExtractionSchema = z.object({
  hanzi: str.min(1),
  pinyin: optStr,
  pinyinSource: optProv,
  french: optStr,
  frenchSource: optProv,
  english: optStr,
  englishSource: optProv,
  origin: SentenceOriginSchema.default("TEACHER_MATERIAL"),
  sourcePage: optPage,
  confidence: ConfidenceSchema.default("MEDIUM"),
});

export const CorrectionExtractionSchema = z.object({
  incorrect: str.min(1),
  correct: str.min(1),
  explanation: optStr,
  explanationSource: optProv,
  context: optStr,
  sourcePage: optPage,
  confidence: ConfidenceSchema.default("MEDIUM"),
});

export const PdfExerciseTypeSchema = z.enum([
  "DISCUSSION",
  "COMPREHENSION",
  "FILL_BLANK",
  "TRANSLATION",
  "OTHER",
]);

export const ExerciseExtractionSchema = z.object({
  type: PdfExerciseTypeSchema.default("OTHER"),
  prompt: str.min(1),
  answer: optStr,
  context: optStr,
  sourcePage: optPage,
});

export const LessonExtractionSchema = z.object({
  lesson: z.object({
    title: str.min(1),
    titleChinese: optStr,
    date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .nullish()
      .transform((v) => v ?? null),
    topics: z.array(str.min(1)).default([]),
    summary: optStr,
  }),
  vocabulary: z.array(VocabularyExtractionSchema).default([]),
  grammarPoints: z.array(GrammarExtractionSchema).default([]),
  sentences: z.array(SentenceExtractionSchema).default([]),
  corrections: z.array(CorrectionExtractionSchema).default([]),
  exercises: z.array(ExerciseExtractionSchema).default([]),
  warnings: z.array(str).default([]),
});

export type LessonExtraction = z.infer<typeof LessonExtractionSchema>;
export type VocabularyExtraction = z.infer<typeof VocabularyExtractionSchema>;
export type GrammarExtraction = z.infer<typeof GrammarExtractionSchema>;
export type SentenceExtraction = z.infer<typeof SentenceExtractionSchema>;
export type CorrectionExtraction = z.infer<typeof CorrectionExtractionSchema>;
export type ExerciseExtraction = z.infer<typeof ExerciseExtractionSchema>;
export type ExampleExtraction = z.infer<typeof ExampleExtractionSchema>;
export type Provenance = z.infer<typeof ProvenanceSchema>;
export type ConfidenceLevel = z.infer<typeof ConfidenceSchema>;

// ─── Brouillon de validation (extraction + décisions utilisateur) ──────────────

export const DecisionSchema = z.enum(["pending", "approved", "rejected"]);

export const DuplicateSchema = z
  .object({
    knowledgeItemId: z.string(),
    label: z.string(),
    /** merge = rattacher à la connaissance existante ; new = créer une connaissance distincte. */
    action: z.enum(["merge", "new"]),
  })
  .nullish()
  .transform((v) => v ?? null);

const draftMeta = {
  id: z.string(),
  decision: DecisionSchema.default("pending"),
  /** Vrai si l'utilisateur a modifié l'élément (les champs modifiés passent en USER). */
  edited: z.boolean().default(false),
  duplicate: DuplicateSchema,
};

/** Informations propres aux mots proposés depuis une ressource externe. */
export const ResourceWordSchema = z.object({
  tier: z.enum(["useful", "rare"]),
  /** Niveau HSK 3.0 (7 = 7-9), null si le mot n'est pas dans la liste. */
  hsk: z.number().int().nullable(),
  /** Nombre d'occurrences dans la ressource. */
  count: z.number().int(),
  /** Vidéo : moment (secondes) où le mot est prononcé pour la première fois. */
  time: z.number().nullish().transform((v) => v ?? null),
});
export type ResourceWord = z.infer<typeof ResourceWordSchema>;

export const DraftSchema = z.object({
  lesson: LessonExtractionSchema.shape.lesson,
  vocabulary: z.array(
    VocabularyExtractionSchema.extend({ ...draftMeta, resource: ResourceWordSchema.nullish().transform((v) => v ?? null) }),
  ),
  grammarPoints: z.array(GrammarExtractionSchema.extend(draftMeta)),
  sentences: z.array(SentenceExtractionSchema.extend(draftMeta)),
  corrections: z.array(CorrectionExtractionSchema.extend(draftMeta)),
  exercises: z.array(ExerciseExtractionSchema.extend(draftMeta)),
  warnings: z.array(z.string()),
});

export type Draft = z.infer<typeof DraftSchema>;
export type DraftVocabulary = Draft["vocabulary"][number];
export type DraftGrammar = Draft["grammarPoints"][number];
export type DraftSentence = Draft["sentences"][number];
export type DraftCorrection = Draft["corrections"][number];
export type DraftExercise = Draft["exercises"][number];
export type DraftSection = "vocabulary" | "grammarPoints" | "sentences" | "corrections" | "exercises";

// ─── Évaluations IA ───────────────────────────────────────────────────────────

export const MistakeCategorySchema = z.enum([
  "MEANING",
  "CHARACTER",
  "PINYIN",
  "TONE",
  "PRONUNCIATION",
  "GRAMMAR",
  "WORD_ORDER",
  "CLASSIFIER",
  "LISTENING",
  "USAGE",
  "OTHER",
]);

export const AnswerEvaluationSchema = z.object({
  result: z.enum(["CORRECT", "MOSTLY_CORRECT", "INCORRECT"]),
  explanation: z.string().max(400),
  mistakeCategory: MistakeCategorySchema.nullish().transform((v) => v ?? null),
  correctedAnswer: optStr,
});
export type AnswerEvaluation = z.infer<typeof AnswerEvaluationSchema>;

export const SpeakingFeedbackSchema = z.object({
  result: z.enum(["CORRECT", "MOSTLY_CORRECT", "INCORRECT"]),
  understood: z.boolean(),
  summary: z.string().max(300),
  correctedSentence: optStr,
  correctedPinyin: optStr,
  corrections: z
    .array(
      z.object({
        category: MistakeCategorySchema,
        original: z.string(),
        corrected: z.string(),
        explanation: z.string().max(250),
        targetHanzi: optStr,
      }),
    )
    .max(3)
    .default([]),
  targetsUsed: z.array(z.string()).default([]),
  targetsMissing: z.array(z.string()).default([]),
});
export type SpeakingFeedback = z.infer<typeof SpeakingFeedbackSchema>;

export const ConversationSetupSchema = z.object({
  title: z.string(),
  situationFr: z.string().max(400),
  roleFr: z.string().max(200),
  openingHanzi: z.string(),
  openingPinyin: z.string(),
  openingFrench: z.string(),
});
export type ConversationSetup = z.infer<typeof ConversationSetupSchema>;

export const ConversationReplySchema = z.object({
  replyHanzi: z.string(),
  replyPinyin: z.string(),
  replyFrench: z.string(),
  feedback: SpeakingFeedbackSchema.pick({
    understood: true,
    correctedSentence: true,
    correctedPinyin: true,
    corrections: true,
    targetsUsed: true,
  }),
  shouldEnd: z.boolean().default(false),
});
export type ConversationReply = z.infer<typeof ConversationReplySchema>;

export const ConversationSummarySchema = z.object({
  summaryFr: z.string().max(600),
  strengths: z.array(z.string()).max(3).default([]),
  toReview: z.array(z.string()).max(5).default([]),
  targetsUsed: z.array(z.string()).default([]),
});
export type ConversationSummary = z.infer<typeof ConversationSummarySchema>;

export const GlossTranslationSchema = z.object({
  items: z.array(z.object({ index: z.number().int(), french: z.string() })),
});

// ─── Rangement par thème ──────────────────────────────────────────────────────

export const ThemeClassificationSchema = z.object({
  newThemes: z
    .array(
      z.object({
        name: z.string().min(1).max(40),
        emoji: z.string().max(8).nullable(),
        description: z.string().max(200),
      }),
    )
    .max(15),
  assignments: z.array(
    z.object({
      id: z.string(),
      themes: z.array(z.string().min(1).max(40)).max(2),
    }),
  ),
});
export type ThemeClassification = z.infer<typeof ThemeClassificationSchema>;

// ─── Ressources externes ──────────────────────────────────────────────────────

export const ResourceEnrichmentSchema = z.object({
  title: z.string().min(1).max(120),
  titleChinese: z.string().max(120).nullable(),
  summary: z.string().max(400),
  topics: z.array(z.string().min(1).max(40)).max(5),
  words: z.array(
    z.object({
      id: z.string(),
      /** false : nom propre, découpage erroné, mot sans intérêt pour l'apprentissage. */
      keep: z.boolean(),
      /** Forme corrigée du mot telle qu'elle apparaît dans le texte (souvent identique). */
      hanzi: z.string().min(1).max(20),
      pinyin: z.string().max(80),
      french: z.string().max(120),
      partOfSpeech: z.string().max(30).nullable(),
      kind: z.enum(["VOCABULARY", "EXPRESSION"]),
      contextFrench: z.string().max(300).nullable(),
    }),
  ),
  expressions: z
    .array(
      z.object({
        hanzi: z.string().min(2).max(20),
        pinyin: z.string().max(80),
        french: z.string().max(120),
        context: z.string().max(200),
        contextFrench: z.string().max(300).nullable(),
      }),
    )
    .max(10),
});
export type ResourceEnrichment = z.infer<typeof ResourceEnrichmentSchema>;
