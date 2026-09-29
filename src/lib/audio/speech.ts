/**
 * Couche audio (SpeechProvider).
 * Implémentation par défaut : API Web Speech du navigateur (gratuite, locale au navigateur) :
 *  - synthèse : speechSynthesis (voix zh-CN du système) ;
 *  - transcription : SpeechRecognition (Chrome, Edge, Safari).
 * Remplaçable par un fournisseur serveur (ex. Whisper) sans toucher aux composants.
 */

export interface SynthesizeOptions {
  rate?: number;
  onEnd?: () => void;
}

export interface TranscriptionSession {
  stop(): void;
  abort(): void;
}

export interface TranscribeHandlers {
  onPartial?: (text: string) => void;
  onFinal: (text: string) => void;
  /** `code` : code d'erreur de l'API (ex. « network »), pour permettre un repli. */
  onError: (message: string, code?: string) => void;
  onEnd?: () => void;
}

export interface SpeechProvider {
  readonly name: string;
  canSynthesize(): boolean;
  hasChineseVoice(): boolean;
  synthesize(text: string, opts?: SynthesizeOptions): void;
  cancel(): void;
  canTranscribe(): boolean;
  transcribe(handlers: TranscribeHandlers): TranscriptionSession | null;
}

type RecognitionCtor = new () => {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  maxAlternatives: number;
  onresult: ((e: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
};

function recognitionCtor(): RecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

function chineseVoice(): SpeechSynthesisVoice | null {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return null;
  const voices = window.speechSynthesis.getVoices();
  return (
    voices.find((v) => /zh[-_]CN/i.test(v.lang)) ??
    voices.find((v) => /^zh/i.test(v.lang) && !/HK|TW/i.test(v.lang)) ??
    voices.find((v) => /^zh/i.test(v.lang)) ??
    null
  );
}

/**
 * La reconnaissance du navigateur envoie l'audio aux serveurs de Google : elle ne fonctionne que
 * dans Google Chrome (et Safari/Edge avec leur propre service). Brave, Arc, Opera, Vivaldi… exposent
 * l'API mais échouent toujours avec « network ». Dans ce cas on ne l'utilise plus (transcription locale).
 */
let browserSttBroken = false;
export const BROKEN_RECOGNITION_ERRORS = new Set(["network", "service-not-allowed"]);

function browserSttUnusable(): boolean {
  if (browserSttBroken) return true;
  return typeof navigator !== "undefined" && "brave" in navigator;
}

const RECOGNITION_ERRORS: Record<string, string> = {
  "not-allowed": "Accès au microphone refusé. Autorise-le dans les réglages du navigateur.",
  "service-not-allowed": "La reconnaissance vocale n'est pas autorisée par le navigateur.",
  "no-speech": "Aucune parole détectée. Réessaie en parlant plus près du micro.",
  "audio-capture": "Aucun microphone détecté.",
  network: "La reconnaissance vocale de ce navigateur ne fonctionne pas (elle n'est fiable que dans Google Chrome, Safari ou Edge).",
  aborted: "Enregistrement interrompu.",
};

export class BrowserSpeechProvider implements SpeechProvider {
  readonly name: string = "browser";

  canSynthesize(): boolean {
    return typeof window !== "undefined" && "speechSynthesis" in window;
  }

  hasChineseVoice(): boolean {
    return !!chineseVoice();
  }

  synthesize(text: string, opts: SynthesizeOptions = {}): void {
    if (!this.canSynthesize()) return;
    const synth = window.speechSynthesis;
    synth.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "zh-CN";
    const voice = chineseVoice();
    if (voice) u.voice = voice;
    u.rate = opts.rate ?? 0.9;
    u.onend = () => opts.onEnd?.();
    u.onerror = () => opts.onEnd?.();
    synth.speak(u);
  }

  cancel(): void {
    if (this.canSynthesize()) window.speechSynthesis.cancel();
  }

  canTranscribe(): boolean {
    return !!recognitionCtor() && !browserSttUnusable();
  }

  transcribe(handlers: TranscribeHandlers): TranscriptionSession | null {
    const Ctor = recognitionCtor();
    if (!Ctor || browserSttUnusable()) {
      handlers.onError("La reconnaissance vocale n'est pas disponible dans ce navigateur (utilise Chrome, Edge ou Safari).");
      return null;
    }
    const rec = new Ctor();
    rec.lang = "zh-CN";
    rec.interimResults = true;
    rec.continuous = true;
    rec.maxAlternatives = 1;
    let finalText = "";
    let lastPartial = "";
    rec.onresult = (e) => {
      let partial = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) finalText += r[0].transcript;
        else partial += r[0].transcript;
      }
      lastPartial = partial;
      handlers.onPartial?.(finalText + partial);
    };
    rec.onerror = (e) => {
      if (BROKEN_RECOGNITION_ERRORS.has(e.error)) browserSttBroken = true;
      handlers.onError(RECOGNITION_ERRORS[e.error] ?? `Erreur de reconnaissance vocale (${e.error}).`, e.error);
    };
    rec.onend = () => {
      handlers.onFinal((finalText + lastPartial).trim());
      handlers.onEnd?.();
    };
    try {
      rec.start();
    } catch {
      handlers.onError("Impossible de démarrer la reconnaissance vocale.");
      return null;
    }
    return { stop: () => rec.stop(), abort: () => rec.abort() };
  }
}

/**
 * Synthèse par le serveur (voix Edge ou Google, très naturelles) avec repli sur la voix
 * du navigateur si le service n'est pas configuré ou ne répond pas.
 * La transcription reste celle du navigateur.
 */
export class CloudFirstSpeechProvider extends BrowserSpeechProvider {
  readonly name: string = "cloud-first";
  private audio: HTMLAudioElement | null = null;
  private cloudDisabled = false;

  private cloudConfig(): { enabled: boolean; voice: string } {
    if (typeof document === "undefined") return { enabled: false, voice: "" };
    const d = document.body.dataset;
    return { enabled: d.ttsCloud === "1" && !this.cloudDisabled, voice: d.ttsVoice ?? "" };
  }

  canSynthesize(): boolean {
    return this.cloudConfig().enabled || super.canSynthesize();
  }

  hasChineseVoice(): boolean {
    return this.cloudConfig().enabled || super.hasChineseVoice();
  }

  synthesize(text: string, opts: SynthesizeOptions = {}): void {
    const cfg = this.cloudConfig();
    if (!cfg.enabled) return super.synthesize(text, opts);
    this.cancel();
    const params = new URLSearchParams({ text, speed: (opts.rate ?? 0.9) < 0.8 ? "slow" : "normal" });
    if (cfg.voice) params.set("voice", cfg.voice);
    const audio = new Audio(`/api/tts?${params}`);
    this.audio = audio;
    let fellBack = false;
    const fallback = () => {
      if (fellBack || this.audio !== audio) return;
      fellBack = true;
      this.audio = null;
      super.synthesize(text, opts);
    };
    audio.onended = () => opts.onEnd?.();
    audio.onerror = () => {
      // 501 (non configuré) ou erreur réseau : on bascule sur la voix du navigateur.
      fetch(`/api/tts?${params}`, { method: "GET" })
        .then((r) => {
          if (r.status === 501) this.cloudDisabled = true;
        })
        .catch(() => undefined);
      fallback();
    };
    audio.play().catch(() => fallback());
  }

  cancel(): void {
    if (this.audio) {
      this.audio.pause();
      this.audio = null;
    }
    super.cancel();
  }
}

let provider: SpeechProvider | null = null;
export function getSpeechProvider(): SpeechProvider {
  if (!provider) provider = new CloudFirstSpeechProvider();
  return provider;
}
