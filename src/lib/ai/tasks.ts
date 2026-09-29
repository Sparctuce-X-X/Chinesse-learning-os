import "server-only";
import { createHash } from "node:crypto";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { runAI } from "./index";
import {
  AnswerEvaluationSchema,
  ConversationReplySchema,
  ConversationSetupSchema,
  ConversationSummarySchema,
  LessonExtractionSchema,
  ResourceEnrichmentSchema,
  SpeakingFeedbackSchema,
  ThemeClassificationSchema,
  type AnswerEvaluation,
  type ConversationReply,
  type ConversationSetup,
  type ConversationSummary,
  type LessonExtraction,
  type ResourceEnrichment,
  type SpeakingFeedback,
  type ThemeClassification,
} from "./schemas";

// ─── Cache des résultats stables ──────────────────────────────────────────────

function cacheKey(kind: string, payload: unknown): string {
  return `${kind}:${createHash("sha256").update(JSON.stringify(payload)).digest("hex")}`;
}

async function cached<T>(kind: string, payload: unknown, schema: z.ZodType<T>, fn: () => Promise<T>): Promise<T> {
  const key = cacheKey(kind, payload);
  const hit = await prisma.aICache.findUnique({ where: { key } }).catch(() => null);
  if (hit) {
    const parsed = schema.safeParse(hit.value);
    if (parsed.success) return parsed.data;
  }
  const value = await fn();
  await prisma.aICache
    .upsert({ where: { key }, create: { key, kind, value: value as object }, update: { value: value as object } })
    .catch(() => undefined);
  return value;
}

// ─── Analyse d'un cours ───────────────────────────────────────────────────────

const LESSON_SYSTEM = `Tu es un assistant d'extraction pour une application personnelle d'apprentissage du chinois mandarin.
L'utilisateur est francophone. Il suit des cours particuliers ; la professeure fournit des PDF (diaporamas, notes, tableaux).
Ta mission : extraire fidèlement les connaissances du cours dans la structure demandée.

RÈGLES ABSOLUES
1. N'invente jamais de contenu qui n'est pas dans le PDF. Tout élément extrait doit exister dans le document.
2. Provenance champ par champ :
   - "TEACHER" = lu tel quel dans le PDF (texte ou image).
   - "AI" = tu l'as déduit, complété ou traduit toi-même.
   Exemples : pinyin absent du PDF que tu ajoutes → pinyinSource "AI". Glose anglaise du PDF → englishSource "TEACHER".
   Traduction française que tu produis à partir de l'anglais → frenchSource "AI".
   Exemples : "source" = provenance de la phrase chinoise, "translationSource" = provenance de la traduction
   (une phrase de la professeure traduite par toi → source "TEACHER", translationSource "AI").
3. Remplis TOUJOURS le champ "french" (en le marquant "AI" si tu le traduis) : l'utilisateur révise en français.
4. Ajoute le pinyin avec diacritiques (syllabes séparées par des espaces) quand il manque, marqué "AI".
5. confidence : HIGH si l'information est explicite et nette ; MEDIUM si l'interprétation est probable ; LOW si incertaine.
6. Phrases produites par l'élève (zones « Practice », phrases maladroites ou fautives) : origin "STUDENT_PRACTICE", confidence LOW ou MEDIUM. Ne les présente pas comme modèles.
   Si la professeure a corrigé une phrase de l'élève, crée une entrée "corrections".
7. Notes libres de la professeure (mots notés pendant le cours, mélange chinois/anglais/français) : ce sont des mots nouveaux importants → vocabulary.
8. Les mots surlignés (couleur) dans les textes/dialogues sont du vocabulaire clé → highlighted true.
9. sourcePage = numéro de page (1-indexé) où l'élément apparaît. sourceText = extrait court de la ligne source.
10. Pas de doublons : un même mot n'apparaît qu'une fois dans vocabulary (garde la meilleure source).
11. Dialogues des textes : extrais les répliques utiles comme sentences (origin "DIALOGUE"), au plus 25.
12. Grammaire : name = la structure (ex. « 只要…就… »), structure = le schéma, explanation = l'explication (en français, marquée AI si traduite), examples.
13. Exercices du PDF (questions de discussion, compréhension, textes à trous) → exercises.
14. lesson.title : titre court en français (traduis le titre si nécessaire). titleChinese : titre chinois s'il existe.
    lesson.date : uniquement si une date de cours figure dans le document ou le nom du fichier (format YYYY-MM-DD), sinon null.
    lesson.topics : 1 à 5 thèmes courts en français.
15. warnings : signale en français les pages illisibles ou les points douteux.`;

export interface AnalyzeLessonInput {
  filename: string;
  pdfPath: string;
  pages: { pageNumber: number; text: string; likelyImage: boolean }[];
  pdfCreatedAt: Date | null;
}

export async function analyzeLesson(input: AnalyzeLessonInput): Promise<LessonExtraction> {
  const imagePages = input.pages.filter((p) => p.likelyImage).map((p) => p.pageNumber);
  const pagesText = input.pages
    .map((p) => `=== PAGE ${p.pageNumber}${p.likelyImage ? " (image : texte non extractible, lis la page visuellement)" : ""} ===\n${p.text}`)
    .join("\n\n");
  const prompt = `Nom du fichier : ${input.filename}
Nombre de pages : ${input.pages.length}
${imagePages.length ? `Pages sans couche texte (à lire visuellement dans le PDF) : ${imagePages.join(", ")}` : ""}

Texte extrait automatiquement, page par page (les tabulations séparent les colonnes des tableaux) :

${pagesText}

Consulte le PDF pour les pages images, le pinyin affiché au-dessus des caractères et les mots surlignés.
Produis l'extraction complète du cours.`;
  return runAI(
    {
      task: "analyze-lesson",
      system: LESSON_SYSTEM,
      prompt,
      schema: LessonExtractionSchema,
      tier: "smart",
      timeoutMs: Number(process.env.AI_LESSON_TIMEOUT_MS || 600_000),
      pdfPath: input.pdfPath,
      mockContext: input,
    },
    1,
  );
}

// ─── Évaluation d'une réponse ─────────────────────────────────────────────────

export interface EvaluateAnswerInput {
  exerciseType: string;
  question: string;
  expected: string;
  alternatives?: string[];
  userAnswer: string;
  context?: string;
}

export async function evaluateAnswer(input: EvaluateAnswerInput): Promise<AnswerEvaluation> {
  return cached("eval-answer", input, AnswerEvaluationSchema, () =>
    runAI({
      task: "evaluate-answer",
      system: `Tu corriges les réponses d'un apprenant francophone de chinois mandarin (niveau HSK 3-4).
Plusieurs réponses peuvent être correctes : accepte toute formulation naturelle et grammaticale qui exprime le sens demandé.
CORRECT = juste et naturelle. MOSTLY_CORRECT = compréhensible avec une petite erreur (ton, caractère proche, mot légèrement inadapté). INCORRECT = sens faux ou incompréhensible.
explanation : une ou deux phrases en français, concrètes, sans long cours. mistakeCategory : la catégorie principale si ce n'est pas CORRECT.
correctedAnswer : la version corrigée la plus proche de la réponse de l'apprenant (en chinois si la réponse attendue est en chinois).`,
      prompt: `Type d'exercice : ${input.exerciseType}
Consigne : ${input.question}
Réponse de référence : ${input.expected}${input.alternatives?.length ? `\nAutres réponses acceptées : ${input.alternatives.join(" | ")}` : ""}${input.context ? `\nContexte : ${input.context}` : ""}
Réponse de l'apprenant : ${input.userAnswer}`,
      schema: AnswerEvaluationSchema,
      tier: "fast",
      timeoutMs: 90_000,
      mockContext: input,
    }),
  );
}

// ─── Oral ─────────────────────────────────────────────────────────────────────

export interface EvaluateSpeakingInput {
  question: string;
  questionFr?: string;
  targets: string[];
  transcription: string;
}

const FEEDBACK_RULES = `Priorités du feedback : 1) ce qui empêche la compréhension, 2) la grammaire ciblée, 3) le vocabulaire ciblé, 4) la prononciation (déduite de la transcription), 5) le naturel.
Au maximum 3 corrections, les plus importantes. Explications en français, très courtes. Ne transforme pas la réponse en cours complet.
La transcription vient d'une reconnaissance vocale : une erreur de caractère homophone peut venir de la transcription, pas de l'élève — dans ce cas, catégorie PRONUNCIATION seulement si le ton semble faux.`;

export async function evaluateSpeaking(input: EvaluateSpeakingInput): Promise<SpeakingFeedback> {
  return runAI({
    task: "evaluate-speaking",
    system: `Tu es une professeure de chinois bienveillante qui évalue une réponse orale d'un apprenant francophone.\n${FEEDBACK_RULES}`,
    prompt: `Question posée : ${input.question}${input.questionFr ? ` (${input.questionFr})` : ""}
Connaissances ciblées (à réutiliser si possible) : ${input.targets.join("、") || "aucune"}
Transcription de la réponse orale : ${input.transcription}
targetsUsed / targetsMissing : liste des connaissances ciblées utilisées ou non.`,
    schema: SpeakingFeedbackSchema,
    tier: "fast",
    timeoutMs: 90_000,
    mockContext: input,
  });
}

// ─── Conversation ─────────────────────────────────────────────────────────────

export interface ConversationTargets {
  vocabulary: string[];
  grammar: string[];
  mistakes: string[];
}

export async function createConversation(scenario: string, targets: ConversationTargets): Promise<ConversationSetup> {
  return runAI({
    task: "conversation-setup",
    system: `Tu crées de courtes conversations orales en chinois mandarin pour un apprenant francophone (niveau HSK 3-4).
Tu joues un personnage dans une situation concrète. La situation doit donner naturellement l'occasion d'utiliser les connaissances ciblées, sans jamais dire « utilise le mot X ».
Phrases courtes et naturelles, vocabulaire simple hors cibles.`,
    prompt: `Scénario : ${scenario}
Vocabulaire ciblé : ${targets.vocabulary.join("、") || "libre"}
Grammaire ciblée : ${targets.grammar.join("、") || "libre"}
Points faibles récents : ${targets.mistakes.join("、") || "aucun"}
Donne le titre (français), la situation et ton rôle (français), puis ta première réplique en chinois avec pinyin et traduction française.`,
    schema: ConversationSetupSchema,
    tier: "fast",
    timeoutMs: 90_000,
    mockContext: { scenario, targets },
  });
}

export interface ConversationHistoryTurn {
  role: "USER" | "ASSISTANT";
  hanzi: string;
}

export async function replyConversation(input: {
  scenario: string;
  situation: string;
  targets: ConversationTargets;
  history: ConversationHistoryTurn[];
  userMessage: string;
}): Promise<ConversationReply> {
  const transcript = input.history.map((t) => `${t.role === "USER" ? "Apprenant" : "Toi"} : ${t.hanzi}`).join("\n");
  return runAI({
    task: "conversation-reply",
    system: `Tu joues ton personnage dans une conversation orale en chinois avec un apprenant francophone (HSK 3-4).
Réponds en 1 à 2 phrases courtes et naturelles, puis relance la conversation par une question qui incite à utiliser les connaissances ciblées.
Évalue aussi le dernier message de l'apprenant (feedback). ${FEEDBACK_RULES}
shouldEnd = true quand la conversation a atteint une conclusion naturelle (environ 6 à 8 échanges).`,
    prompt: `Scénario : ${input.scenario}
Situation : ${input.situation}
Vocabulaire ciblé : ${input.targets.vocabulary.join("、") || "libre"}
Grammaire ciblée : ${input.targets.grammar.join("、") || "libre"}

Conversation jusqu'ici :
${transcript}

Nouveau message de l'apprenant : ${input.userMessage}`,
    schema: ConversationReplySchema,
    tier: "fast",
    timeoutMs: 90_000,
    mockContext: input,
  });
}

export async function summarizeConversation(input: {
  scenario: string;
  targets: ConversationTargets;
  history: ConversationHistoryTurn[];
}): Promise<ConversationSummary> {
  const transcript = input.history.map((t) => `${t.role === "USER" ? "Apprenant" : "Partenaire"} : ${t.hanzi}`).join("\n");
  return runAI({
    task: "conversation-summary",
    system: `Tu résumes une courte conversation d'entraînement en chinois pour un apprenant francophone. Français, concis, encourageant et honnête.`,
    prompt: `Scénario : ${input.scenario}
Connaissances ciblées : ${[...input.targets.vocabulary, ...input.targets.grammar].join("、")}
Conversation :
${transcript}

Donne un résumé (2-3 phrases), jusqu'à 3 points forts, jusqu'à 5 points à retravailler (en citant le chinois), et les connaissances ciblées effectivement utilisées par l'apprenant.`,
    schema: ConversationSummarySchema,
    tier: "fast",
    timeoutMs: 90_000,
    mockContext: input,
  });
}

// ─── Rangement par thème ──────────────────────────────────────────────────────

export interface ClassifyThemesInput {
  existingThemes: { name: string; description: string | null; count: number }[];
  items: { id: string; type: string; hanzi: string; pinyin: string | null; meaning: string | null; lessonTopics: string[] }[];
}

export async function classifyThemes(input: ClassifyThemesInput): Promise<ThemeClassification> {
  const themes = input.existingThemes.length
    ? input.existingThemes.map((t) => `- ${t.name} (${t.count} éléments)${t.description ? ` : ${t.description}` : ""}`).join("\n")
    : "(aucun thème pour l'instant)";
  const items = input.items
    .map((i) => `${i.id}\t${i.type}\t${i.hanzi}\t${i.pinyin ?? ""}\t${i.meaning ?? ""}${i.lessonTopics.length ? `\t[cours : ${i.lessonTopics.join(", ")}]` : ""}`)
    .join("\n");
  return runAI({
    task: "classify-themes",
    system: `Tu ranges par thème le vocabulaire d'un apprenant francophone de chinois mandarin.
Ses cours sont des conversations libres qui mélangent beaucoup de sujets : un même cours peut parler de salaire, de cuisine et d'informatique.
But : lui permettre de retrouver et réviser ses mots par sujet de conversation.

RÈGLES
1. Réutilise en priorité les thèmes existants, avec leur nom EXACT. Ne crée un thème que si aucun thème existant ne convient vraiment.
2. Granularité : des sujets de conversation concrets et reconnaissables (ex. « Argent et salaire », « Travail et emploi »,
   « Cuisine et alimentation », « Informatique et numérique », « Maison et ménage », « Corps et santé », « Fêtes et traditions »,
   « Société et économie »). Évite les fourre-tout (« Vie quotidienne », « Divers ») et les thèmes trop fins (un seul mot).
   Vise à terme 5 à 30 éléments par thème.
3. Les mots grammaticaux ou transversaux (prépositions, adverbes, mots de temps, mots familiers comme 啥 ou 干)
   vont dans un thème dédié : « Mots outils et liaisons », « Temps et fréquence » ou « Langage familier ».
4. Chaque élément reçoit 1 thème, 2 au maximum s'il appartient clairement à deux sujets. Tous les éléments reçoivent au moins un thème.
5. Noms de thèmes en français, courts (≤ 30 caractères), avec une majuscule initiale. Un emoji simple par nouveau thème.
   description : une phrase courte en français décrivant ce que le thème regroupe.
6. newThemes ne contient que les thèmes créés dans cette réponse (pas les existants).
7. assignments : un objet par élément, avec son identifiant exact (colonne 1).`,
    prompt: `Thèmes existants :
${themes}

Éléments à ranger (identifiant, type, chinois, pinyin, sens, sujets du cours d'origine) :
${items}`,
    schema: ThemeClassificationSchema,
    tier: "smart",
    timeoutMs: 240_000,
    mockContext: input,
  });
}

// ─── Ressources externes ──────────────────────────────────────────────────────

export interface EnrichResourceInput {
  titleHint: string | null;
  kind: string;
  /** Extrait du texte (début de la ressource). */
  excerpt: string;
  /** Mots candidats : identifiant court, mot, phrase de contexte. */
  words: { id: string; word: string; context: string }[];
}

export async function enrichResourceWords(input: EnrichResourceInput): Promise<ResourceEnrichment> {
  const words = input.words.map((w) => `${w.id}\t${w.word}\t${w.context}`).join("\n");
  return runAI({
    task: "enrich-resource",
    system: `Tu aides un apprenant francophone de chinois mandarin à apprendre le vocabulaire d'une ressource authentique
(article, vidéo, document) qu'il a choisie lui-même. Le texte a été découpé automatiquement en mots ; on te donne les mots
qu'il ne connaît pas encore, chacun avec la phrase où il apparaît.

RÈGLES
1. Pour chaque mot (identifiant exact en colonne 1) :
   - keep = false pour les noms propres (personnes, marques, lieux peu connus), les erreurs de découpage sans sens,
     les onomatopées et les fragments. keep = true sinon.
   - hanzi : le mot tel qu'il apparaît dans la phrase. Si le découpage l'a coupé (ex. « 年轻 » alors que le texte dit « 年轻人 »),
     donne la forme complète, qui doit figurer mot pour mot dans la phrase de contexte.
   - pinyin : avec diacritiques, syllabes séparées par des espaces, correct DANS CE CONTEXTE (caractères polyphones).
   - french : le sens en français dans ce contexte, court (≤ 6 mots), plusieurs sens séparés par « ; » si utile.
   - kind : "EXPRESSION" pour une expression figée, un chengyu ou une locution ; "VOCABULARY" sinon.
   - contextFrench : traduction française naturelle de la phrase de contexte.
2. expressions : au plus 10 expressions du texte absentes de la liste, RÉUTILISABLES dans une conversation courante
   (chengyu, locutions figées, collocations fréquentes), de 8 caractères au plus, qui doivent apparaître mot pour mot dans le texte.
   Pas de groupes de mots propres au sujet du texte (ex. « 在南京烧鸭的基础上 » est interdit). context = la phrase qui la contient.
   Liste vide si aucune expression ne mérite d'être apprise.
3. title : titre court en français décrivant la ressource. titleChinese : titre chinois s'il existe, sinon null.
   summary : résumé en français en 1 à 2 phrases. topics : 1 à 5 sujets courts en français.
4. N'invente rien : tout ce que tu renvoies en chinois doit exister dans le texte fourni.`,
    prompt: `Type de ressource : ${input.kind}
Titre indiqué : ${input.titleHint ?? "(aucun)"}

Texte (extrait) :
"""
${input.excerpt}
"""

Mots à expliquer (identifiant, mot, phrase de contexte) :
${words}`,
    schema: ResourceEnrichmentSchema,
    tier: "smart",
    timeoutMs: 300_000,
    mockContext: input,
  });
}
