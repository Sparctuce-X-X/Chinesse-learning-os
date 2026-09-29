"use client";

import { useEffect, useState } from "react";
import { BrowserSpeechProvider } from "@/lib/audio/speech";
import { isLocalSttAvailable } from "@/lib/audio/transcribe-client";
import { SpeakButton } from "@/components/speak-button";

export function AudioCheck() {
  const [info, setInfo] = useState<{ tts: boolean; voice: boolean; stt: boolean; local: boolean } | null>(null);
  useEffect(() => {
    // Capacités propres au navigateur (indépendamment de la voix Google).
    const sp = new BrowserSpeechProvider();
    const read = () => setInfo({ tts: sp.canSynthesize(), voice: sp.hasChineseVoice(), stt: sp.canTranscribe(), local: isLocalSttAvailable() });
    read();
    // Les voix se chargent de façon asynchrone dans certains navigateurs.
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.addEventListener("voiceschanged", read);
      return () => window.speechSynthesis.removeEventListener("voiceschanged", read);
    }
  }, []);
  if (!info) return <p className="text-sm text-muted-foreground">Vérification…</p>;
  const row = (ok: boolean, label: string, hint?: string) => (
    <li className="flex items-start gap-2">
      <span aria-hidden className={ok ? "text-success" : "text-destructive"}>{ok ? "✓" : "✗"}</span>
      <span>
        {label} : <strong>{ok ? "oui" : "non"}</strong>
        {!ok && hint && <span className="block text-muted-foreground">{hint}</span>}
      </span>
    </li>
  );
  return (
    <div className="space-y-3 text-sm">
      <ul className="space-y-1">
        {row(info.tts, "Synthèse vocale", "Les exercices d'écoute seront proposés sans audio (tu pourras les passer).")}
        {row(info.voice, "Voix chinoise installée", "Installe une voix chinoise (Réglages système > Accessibilité > Contenu énoncé) pour une meilleure prononciation.")}
        {row(
          info.stt,
          "Reconnaissance vocale du navigateur (en direct)",
          info.local
            ? "Normal dans Brave, Arc ou Firefox : la transcription locale ci-dessous prend le relais."
            : "Pour l'oral, tu pourras taper ta réponse à la place.",
        )}
        {row(
          info.local,
          "Transcription locale (Whisper, sur ta machine)",
          "Désactivée (STT_PROVIDER=none) : tu pourras taper ta réponse à la place.",
        )}
      </ul>
      {info.tts && <SpeakButton text="你好！我们开始学习中文吧。" label="Tester la voix utilisée" showSlow />}
    </div>
  );
}
