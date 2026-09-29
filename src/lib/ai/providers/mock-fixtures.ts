import "server-only";
/**
 * Réponses déterministes du fournisseur simulé (tests automatisés uniquement).
 * Elles s'appuient sur l'extraction heuristique locale : aucune donnée inventée
 * n'est présentée comme venant de la professeure.
 */
import type { MockProvider } from "./mock";
import type { AnalyzeLessonInput, ClassifyThemesInput, EnrichResourceInput, EvaluateAnswerInput, EvaluateSpeakingInput } from "../tasks";
import { hskLookup } from "@/lib/chinese/hsk";
import { heuristicExtract } from "@/lib/pdf/heuristic";
import { normalizeHanzi } from "@/lib/chinese/text";

export function registerDefaultMocks(mock: MockProvider) {
  mock.register("analyze-lesson", (req) => {
    const input = req.mockContext as AnalyzeLessonInput;
    const ex = heuristicExtract({ filename: input.filename, pages: input.pages, pdfCreatedAt: input.pdfCreatedAt });
    return {
      ...ex,
      vocabulary: ex.vocabulary.map((v) => ({
        ...v,
        french: v.french ?? (v.english ? `[IA simulée] ${v.english}` : null),
        frenchSource: v.french ? v.frenchSource : v.english ? "AI" : null,
      })),
      warnings: ["Analyse produite par l'IA simulée (mode test)."],
    };
  });

  mock.register("classify-themes", (req) => {
    const input = req.mockContext as ClassifyThemesInput;
    const existing = new Set(input.existingThemes.map((t) => t.name));
    const pick = (meaning: string | null) =>
      /salaire|argent|revenu|payer|prix/i.test(meaning ?? "") ? "Argent et salaire" : "Autres sujets (IA simulée)";
    const assignments = input.items.map((i) => ({ id: i.id, themes: [pick(i.meaning)] }));
    const used = [...new Set(assignments.flatMap((a) => a.themes))].filter((n) => !existing.has(n));
    return {
      newThemes: used.map((name) => ({ name, emoji: name.startsWith("Argent") ? "💰" : "🧪", description: "Thème simulé (tests)." })),
      assignments,
    };
  });

  mock.register("enrich-resource", (req) => {
    const input = req.mockContext as EnrichResourceInput;
    return {
      title: input.titleHint ? `[IA simulée] ${input.titleHint}` : "[IA simulée] Ressource",
      titleChinese: null,
      summary: "Résumé produit par l'IA simulée (mode test).",
      topics: ["Test"],
      words: input.words.map((w) => {
        const hsk = hskLookup(w.word);
        return {
          id: w.id,
          keep: true,
          hanzi: w.word,
          pinyin: hsk?.pinyin ?? "",
          french: `[IA simulée] ${hsk?.english.split(";")[0] ?? w.word}`,
          partOfSpeech: null,
          kind: "VOCABULARY" as const,
          contextFrench: "[IA simulée] traduction de la phrase",
        };
      }),
      expressions: [],
    };
  });

  mock.register("evaluate-answer", (req) => {
    const input = req.mockContext as EvaluateAnswerInput;
    const ok = normalizeHanzi(input.userAnswer) === normalizeHanzi(input.expected);
    return {
      result: ok ? "CORRECT" : "INCORRECT",
      explanation: ok ? "Réponse correcte (IA simulée)." : "Réponse différente de la référence (IA simulée).",
      mistakeCategory: ok ? null : "GRAMMAR",
      correctedAnswer: ok ? null : input.expected,
    };
  });

  mock.register("evaluate-speaking", (req) => {
    const input = req.mockContext as EvaluateSpeakingInput;
    const used = input.targets.filter((t) => input.transcription.includes(t));
    return {
      result: used.length ? "CORRECT" : "MOSTLY_CORRECT",
      understood: true,
      summary: "Réponse compréhensible (IA simulée).",
      correctedSentence: null,
      correctedPinyin: null,
      corrections: used.length
        ? []
        : [{ category: "USAGE", original: input.transcription, corrected: input.transcription, explanation: "Essaie d'utiliser les mots ciblés.", targetHanzi: input.targets[0] ?? null }],
      targetsUsed: used,
      targetsMissing: input.targets.filter((t) => !used.includes(t)),
    };
  });

  mock.register("conversation-setup", () => ({
    title: "Au café (simulé)",
    situationFr: "Tu commandes une boisson dans un café.",
    roleFr: "Je suis le serveur.",
    openingHanzi: "你好！你想喝什么？",
    openingPinyin: "nǐ hǎo! nǐ xiǎng hē shénme?",
    openingFrench: "Bonjour ! Que veux-tu boire ?",
  }));

  mock.register("conversation-reply", () => ({
    replyHanzi: "好的。你怎么付款？",
    replyPinyin: "hǎo de. nǐ zěnme fùkuǎn?",
    replyFrench: "D'accord. Comment payes-tu ?",
    feedback: { understood: true, correctedSentence: null, correctedPinyin: null, corrections: [], targetsUsed: [] },
    shouldEnd: false,
  }));

  mock.register("conversation-summary", () => ({
    summaryFr: "Conversation courte et compréhensible (IA simulée).",
    strengths: ["Réponses claires"],
    toReview: [],
    targetsUsed: [],
  }));
}
