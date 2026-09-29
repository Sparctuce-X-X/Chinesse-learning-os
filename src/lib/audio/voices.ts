/**
 * Voix de synthèse chinoise, par fournisseur.
 *  - edge   : voix neuronales Microsoft (service en ligne de Microsoft Edge, sans clé) — défaut ;
 *  - google : Google Cloud Text-to-Speech, voix Chirp 3 HD (clé GOOGLE_TTS_API_KEY).
 */
export type TtsProvider = "edge" | "google";
export type TtsSpeed = "normal" | "slow";

export interface TtsVoice {
  id: string;
  label: string;
  gender: "Femme" | "Homme";
  style?: string;
}

export const EDGE_VOICES: TtsVoice[] = [
  { id: "zh-CN-XiaoxiaoNeural", label: "Xiaoxiao", gender: "Femme", style: "chaleureuse" },
  { id: "zh-CN-XiaoyiNeural", label: "Xiaoyi", gender: "Femme", style: "vive" },
  { id: "zh-CN-YunxiNeural", label: "Yunxi", gender: "Homme", style: "jeune, dynamique" },
  { id: "zh-CN-YunjianNeural", label: "Yunjian", gender: "Homme", style: "énergique" },
  { id: "zh-CN-YunyangNeural", label: "Yunyang", gender: "Homme", style: "présentateur" },
  { id: "zh-CN-YunxiaNeural", label: "Yunxia", gender: "Homme", style: "voix d'enfant" },
];

export const GOOGLE_VOICES: TtsVoice[] = [
  { id: "Kore", label: "Kore", gender: "Femme" },
  { id: "Aoede", label: "Aoede", gender: "Femme" },
  { id: "Leda", label: "Leda", gender: "Femme" },
  { id: "Zephyr", label: "Zephyr", gender: "Femme" },
  { id: "Puck", label: "Puck", gender: "Homme" },
  { id: "Charon", label: "Charon", gender: "Homme" },
  { id: "Fenrir", label: "Fenrir", gender: "Homme" },
  { id: "Orus", label: "Orus", gender: "Homme" },
];

export const VOICES: Record<TtsProvider, TtsVoice[]> = { edge: EDGE_VOICES, google: GOOGLE_VOICES };

export const PROVIDER_LABEL: Record<TtsProvider, string> = {
  edge: "Microsoft Edge (voix neuronales, sans clé)",
  google: "Google Chirp 3 HD",
};

export function defaultVoice(provider: TtsProvider): string {
  return VOICES[provider][0].id;
}

export function isVoiceOf(provider: TtsProvider, v: unknown): v is string {
  return typeof v === "string" && VOICES[provider].some((x) => x.id === v);
}

/** Longueur maximale d'un texte synthétisé (une phrase ou une réplique). */
export const TTS_MAX_CHARS = 400;
