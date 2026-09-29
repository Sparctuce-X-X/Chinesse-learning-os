"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import {
  discardImport,
  LessonError,
  saveDraft,
  startAnalysis,
  validateLesson,
  type ValidateInput,
  type ValidationSummary,
} from "@/server/lessons";
import {
  completeSession,
  createSession,
  ReviewError,
  submitAnswer,
  type CreateSessionInput,
  type SubmitInput,
  type SubmitOutcome,
} from "@/server/review";
import { reopenMistake, resolveMistake } from "@/server/mistakes";
import { setKnowledgeSuspended, updateKnowledge, type KnowledgeEdit } from "@/server/knowledge";
import { getUser } from "@/server/user";
import { ConversationError, endConversation, sendConversationMessage, startConversation } from "@/server/conversation";
import type { Draft } from "@/lib/ai/schemas";
import { logError } from "@/lib/log";
import { activeTtsProvider, pregenerateLessonAudio } from "@/server/tts";
import { isVoiceOf } from "@/lib/audio/voices";
import {
  addItemToTheme,
  classifyPendingThemes,
  createTheme,
  deleteTheme,
  listUnthemedIds,
  mergeThemes,
  removeItemFromTheme,
  renameTheme,
  requeueForClassification,
  ThemeError,
} from "@/server/themes";
import { buildManualWord, ResourceError, setHskLevel, setWordKnown } from "@/server/resources";
import type { DraftVocabulary } from "@/lib/ai/schemas";

export type ActionResult<T = null> = { ok: true; data: T } | { ok: false; error: string };

function fail(err: unknown): { ok: false; error: string } {
  const domain = err instanceof LessonError || err instanceof ReviewError || err instanceof ThemeError || err instanceof ResourceError;
  if (!domain) logError("action", err);
  if (domain) return { ok: false, error: err.message };
  if (err instanceof Error && err.message && !/prisma|invalid `/i.test(err.message)) return { ok: false, error: err.message };
  return { ok: false, error: "Une erreur inattendue est survenue." };
}

// ─── Cours ────────────────────────────────────────────────────────────────────

export async function saveDraftAction(lessonId: string, draft: Draft): Promise<ActionResult> {
  try {
    await saveDraft(lessonId, draft);
    return { ok: true, data: null };
  } catch (err) {
    return fail(err);
  }
}

export async function validateLessonAction(
  lessonId: string,
  draft: Draft,
  input: ValidateInput,
): Promise<ActionResult<ValidationSummary>> {
  try {
    await saveDraft(lessonId, draft);
    const summary = await validateLesson(lessonId, input);
    // Audio des nouveaux mots généré en arrière-plan (instantané et hors ligne ensuite).
    void pregenerateLessonAudio(lessonId).catch((err) => logError("tts:pregenerate", err, { lessonId }));
    // Nouveaux mots rangés par thème en arrière-plan (les thèmes existants sont réutilisés).
    void classifyPendingThemes();
    revalidatePath("/", "layout");
    return { ok: true, data: summary };
  } catch (err) {
    return fail(err);
  }
}

export async function reanalyzeLessonAction(lessonId: string, mode: "auto" | "heuristic" = "auto"): Promise<ActionResult> {
  try {
    const lesson = await prisma.lesson.findUnique({ where: { id: lessonId } });
    if (!lesson) return { ok: false, error: "Cours introuvable." };
    await prisma.lesson.update({ where: { id: lessonId }, data: { processingStatus: "ANALYZING", analysisError: null } });
    void startAnalysis(lessonId, mode);
    revalidatePath(`/cours/${lessonId}`);
    return { ok: true, data: null };
  } catch (err) {
    return fail(err);
  }
}

export async function discardImportAction(lessonId: string): Promise<ActionResult> {
  try {
    await discardImport(lessonId);
    revalidatePath("/cours");
    revalidatePath("/ressources");
    return { ok: true, data: null };
  } catch (err) {
    return fail(err);
  }
}

// ─── Ressources externes ──────────────────────────────────────────────────────

export async function setHskLevelAction(level: number): Promise<ActionResult> {
  try {
    await setHskLevel(level);
    revalidatePath("/ressources", "layout");
    return { ok: true, data: null };
  } catch (err) {
    return fail(err);
  }
}

/** « Je le connais déjà » : le mot n'est plus proposé et compte comme connu. */
export async function setWordKnownAction(hanzi: string, known: boolean): Promise<ActionResult> {
  try {
    await setWordKnown(hanzi, known);
    return { ok: true, data: null };
  } catch (err) {
    return fail(err);
  }
}

export async function buildManualWordAction(lessonId: string, hanzi: string): Promise<ActionResult<DraftVocabulary>> {
  try {
    return { ok: true, data: await buildManualWord(lessonId, hanzi) };
  } catch (err) {
    return fail(err);
  }
}

// ─── Sessions ─────────────────────────────────────────────────────────────────

export async function startSessionAction(input: CreateSessionInput): Promise<ActionResult<{ id: string }>> {
  try {
    const { id } = await createSession(input);
    return { ok: true, data: { id } };
  } catch (err) {
    return fail(err);
  }
}

/** Utilisé par les formulaires (bouton « Commencer ma session ») : redirige vers la session. */
export async function startSessionFormAction(formData: FormData): Promise<void> {
  const kind = z.enum(["DAILY", "MISTAKES", "PREPARATION", "LESSON", "KNOWLEDGE"]).catch("DAILY").parse(formData.get("kind"));
  const lessonId = formData.get("lessonId")?.toString() || undefined;
  const ids = formData.getAll("knowledgeItemId").map(String).filter(Boolean);
  let target: string;
  try {
    const reviewsOnly = formData.get("reviewsOnly") === "1";
    const { id } = await createSession({ kind, lessonId, knowledgeItemIds: ids, reviewsOnly });
    target = `/session/${id}`;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Impossible de créer la session.";
    target = `/?message=${encodeURIComponent(message)}`;
  }
  redirect(target);
}

export async function submitAnswerAction(sessionId: string, input: SubmitInput): Promise<ActionResult<SubmitOutcome>> {
  try {
    return { ok: true, data: await submitAnswer(sessionId, input) };
  } catch (err) {
    return fail(err);
  }
}

export async function completeSessionAction(sessionId: string): Promise<ActionResult> {
  try {
    await completeSession(sessionId);
    revalidatePath("/", "layout");
    return { ok: true, data: null };
  } catch (err) {
    return fail(err);
  }
}

// ─── Erreurs ──────────────────────────────────────────────────────────────────

export async function resolveMistakeAction(id: string): Promise<ActionResult> {
  try {
    await resolveMistake(id);
    revalidatePath("/erreurs");
    return { ok: true, data: null };
  } catch (err) {
    return fail(err);
  }
}

export async function reopenMistakeAction(id: string): Promise<ActionResult> {
  try {
    await reopenMistake(id);
    revalidatePath("/erreurs");
    return { ok: true, data: null };
  } catch (err) {
    return fail(err);
  }
}

// ─── Connaissances ────────────────────────────────────────────────────────────

export async function updateKnowledgeAction(id: string, edit: KnowledgeEdit): Promise<ActionResult> {
  try {
    await updateKnowledge(id, edit);
    revalidatePath(`/connaissances/${id}`);
    return { ok: true, data: null };
  } catch (err) {
    return fail(err);
  }
}

export async function setSuspendedAction(id: string, suspended: boolean): Promise<ActionResult> {
  try {
    await setKnowledgeSuspended(id, suspended);
    revalidatePath(`/connaissances/${id}`);
    return { ok: true, data: null };
  } catch (err) {
    return fail(err);
  }
}

// ─── Paramètres ───────────────────────────────────────────────────────────────

const SettingsSchema = z.object({
  name: z.string().trim().min(1).max(40),
  dailyGoalMinutes: z.coerce.number().int().min(3).max(60),
  newItemsPerSession: z.coerce.number().int().min(0).max(30),
  newItemsPerDay: z.coerce.number().int().min(0).max(50),
  maxReviewsPerSession: z.coerce.number().int().min(5).max(100),
});

export async function saveSettingsAction(_: unknown, formData: FormData): Promise<ActionResult> {
  const parsed = SettingsSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: "Valeurs invalides." };
  const user = await getUser();
  await prisma.user.update({ where: { id: user.id }, data: parsed.data });
  revalidatePath("/", "layout");
  return { ok: true, data: null };
}

// ─── Conversation IA ──────────────────────────────────────────────────────────

export async function startConversationAction(scenario: string): Promise<ActionResult<{ id: string }>> {
  try {
    return { ok: true, data: { id: await startConversation(scenario) } };
  } catch (err) {
    if (err instanceof ConversationError) return { ok: false, error: err.message };
    return fail(err);
  }
}

export async function sendConversationMessageAction(
  id: string,
  message: string,
  inputMode: "TEXT" | "VOICE",
  durationSeconds?: number,
): Promise<ActionResult<{ shouldEnd: boolean }>> {
  try {
    const res = await sendConversationMessage(id, message, inputMode, durationSeconds);
    revalidatePath(`/conversation/${id}`);
    return { ok: true, data: res };
  } catch (err) {
    revalidatePath(`/conversation/${id}`);
    if (err instanceof ConversationError) return { ok: false, error: err.message };
    return fail(err);
  }
}

export async function endConversationAction(id: string): Promise<ActionResult> {
  try {
    await endConversation(id);
    revalidatePath(`/conversation/${id}`);
    return { ok: true, data: null };
  } catch (err) {
    if (err instanceof ConversationError) return { ok: false, error: err.message };
    return fail(err);
  }
}

export async function saveVoiceAction(voice: string): Promise<ActionResult> {
  const provider = activeTtsProvider();
  if (!provider || !isVoiceOf(provider, voice)) return { ok: false, error: "Voix inconnue." };
  const user = await getUser();
  await prisma.user.update({ where: { id: user.id }, data: { ttsVoice: voice } });
  revalidatePath("/", "layout");
  return { ok: true, data: null };
}

// ─── Thèmes ───────────────────────────────────────────────────────────────────

/** Lance le rangement des éléments pas encore rangés (en arrière-plan). */
export async function classifyThemesAction(opts: { includeUnthemed?: boolean } = {}): Promise<ActionResult> {
  try {
    if (opts.includeUnthemed) await requeueForClassification(await listUnthemedIds());
    void classifyPendingThemes();
    return { ok: true, data: null };
  } catch (err) {
    return fail(err);
  }
}

const ThemeNameSchema = z.object({
  name: z.string().max(60),
  emoji: z.string().max(8).nullable().optional(),
  description: z.string().max(300).nullable().optional(),
});

export async function createThemeAction(input: z.input<typeof ThemeNameSchema>): Promise<ActionResult<{ id: string }>> {
  try {
    const data = await createTheme(ThemeNameSchema.parse(input));
    revalidatePath("/themes");
    return { ok: true, data };
  } catch (err) {
    return fail(err);
  }
}

export async function renameThemeAction(id: string, input: z.input<typeof ThemeNameSchema>): Promise<ActionResult> {
  try {
    await renameTheme(id, ThemeNameSchema.parse(input));
    revalidatePath("/themes");
    return { ok: true, data: null };
  } catch (err) {
    return fail(err);
  }
}

export async function mergeThemesAction(sourceId: string, targetId: string): Promise<ActionResult> {
  try {
    await mergeThemes(sourceId, targetId);
    revalidatePath("/themes");
    return { ok: true, data: null };
  } catch (err) {
    return fail(err);
  }
}

export async function deleteThemeAction(id: string): Promise<ActionResult> {
  try {
    await deleteTheme(id);
    revalidatePath("/themes");
    return { ok: true, data: null };
  } catch (err) {
    return fail(err);
  }
}

export async function setItemThemeAction(knowledgeItemId: string, themeId: string, member: boolean): Promise<ActionResult> {
  try {
    if (member) await addItemToTheme(knowledgeItemId, themeId);
    else await removeItemFromTheme(knowledgeItemId, themeId);
    revalidatePath(`/connaissances/${knowledgeItemId}`);
    revalidatePath("/themes");
    return { ok: true, data: null };
  } catch (err) {
    return fail(err);
  }
}

/** Crée un thème et y range l'élément en une fois. */
export async function createThemeWithItemAction(knowledgeItemId: string, name: string): Promise<ActionResult<{ id: string }>> {
  try {
    const { id } = await createTheme(ThemeNameSchema.parse({ name }));
    await addItemToTheme(knowledgeItemId, id);
    revalidatePath(`/connaissances/${knowledgeItemId}`);
    revalidatePath("/themes");
    return { ok: true, data: { id } };
  } catch (err) {
    return fail(err);
  }
}
