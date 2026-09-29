"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { BROKEN_RECOGNITION_ERRORS, getSpeechProvider, type TranscriptionSession } from "@/lib/audio/speech";
import { isLocalSttAvailable, transcribeRecording } from "@/lib/audio/transcribe-client";

export interface VoiceResult {
  transcript: string;
  audio: Blob | null;
  durationSeconds: number;
}

export type VoiceState = "idle" | "requesting" | "recording" | "processing";

const MAX_SECONDS = 90;

/**
 * Micro : permission, enregistrement audio (MediaRecorder) et transcription chinoise.
 *  - en direct par la reconnaissance vocale du navigateur quand elle fonctionne (Chrome, Safari, Edge) ;
 *  - sinon (Brave, Arc, erreur « network »…) après l'arrêt, par Whisper en local sur le serveur.
 * Sans aucune transcription, l'audio est enregistré et l'utilisateur tape ce qu'il a dit.
 */
export function useVoiceInput() {
  const [state, setState] = useState<VoiceState>("idle");
  const [partial, setPartial] = useState("");
  const [transcribing, setTranscribing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [support, setSupport] = useState<{ mic: boolean; stt: boolean } | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const chunks = useRef<Blob[]>([]);
  const recognition = useRef<TranscriptionSession | null>(null);
  const transcript = useRef("");
  const startedAt = useRef(0);
  const resolver = useRef<((r: VoiceResult) => void) | null>(null);
  const pendingParts = useRef(0);

  useEffect(() => {
    // Détection des capacités du navigateur après hydratation.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSupport({
      mic: typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== "undefined",
      stt: getSpeechProvider().canTranscribe() || isLocalSttAvailable(),
    });
  }, []);

  useEffect(() => {
    if (state !== "recording") return;
    const t = setInterval(() => {
      const s = Math.round((Date.now() - startedAt.current) / 1000);
      setElapsed(s);
      if (s >= MAX_SECONDS && recorder.current?.state === "recording") recorder.current.stop();
    }, 500);
    return () => clearInterval(t);
  }, [state]);

  const finishPart = useCallback(async () => {
    pendingParts.current -= 1;
    if (pendingParts.current > 0) return;
    const audio = chunks.current.length ? new Blob(chunks.current, { type: recorder.current?.mimeType || "audio/webm" }) : null;
    const durationSeconds = Math.max(1, Math.round((Date.now() - startedAt.current) / 1000));
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
    // Pas de transcription en direct : transcription locale (Whisper) de l'enregistrement.
    if (!transcript.current.trim() && audio && resolver.current && isLocalSttAvailable()) {
      setTranscribing(true);
      try {
        transcript.current = await transcribeRecording(audio);
        setPartial(transcript.current);
        if (!transcript.current) setError("Aucune parole reconnue. Réessaie en parlant plus près du micro, ou tape ta réponse.");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Transcription impossible. Tu peux taper ce que tu as dit.");
      } finally {
        setTranscribing(false);
      }
    }
    setState("idle");
    resolver.current?.({ transcript: transcript.current.trim(), audio, durationSeconds });
    resolver.current = null;
  }, []);

  const start = useCallback(async () => {
    setError(null);
    setPartial("");
    transcript.current = "";
    chunks.current = [];
    if (typeof window !== "undefined" && !window.isSecureContext) {
      setError("Le micro nécessite une connexion sécurisée (HTTPS ou localhost). Sur téléphone, lance l'application avec « npm run dev:https ». Tu peux taper ta réponse.");
      return;
    }
    setState("requesting");
    pendingParts.current = 0;
    try {
      if (navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== "undefined") {
        stream.current = await navigator.mediaDevices.getUserMedia({ audio: true });
        const rec = new MediaRecorder(stream.current);
        rec.ondataavailable = (e) => e.data.size > 0 && chunks.current.push(e.data);
        rec.onstop = () => void finishPart();
        recorder.current = rec;
        pendingParts.current += 1;
        rec.start();
      }
    } catch (err) {
      const name = err instanceof DOMException ? err.name : "";
      setError(
        name === "NotAllowedError"
          ? "Accès au microphone refusé. Autorise-le dans les réglages du navigateur, ou tape ta réponse."
          : name === "NotFoundError"
            ? "Aucun microphone détecté. Tu peux taper ta réponse."
            : "Impossible d'accéder au microphone. Tu peux taper ta réponse.",
      );
      setState("idle");
      return;
    }
    const sp = getSpeechProvider();
    if (sp.canTranscribe()) {
      pendingParts.current += 1;
      recognition.current = sp.transcribe({
        onPartial: (t) => setPartial(t),
        onFinal: (t) => {
          transcript.current = t;
          setPartial(t);
        },
        onError: (m, code) => {
          // Reconnaissance du navigateur inutilisable : la transcription locale prendra le relais.
          if (code && BROKEN_RECOGNITION_ERRORS.has(code) && isLocalSttAvailable()) return;
          setError(m);
        },
        onEnd: () => void finishPart(),
      });
      if (!recognition.current) pendingParts.current -= 1;
    }
    if (pendingParts.current === 0) {
      setError("L'enregistrement n'est pas disponible dans ce navigateur. Tape ta réponse.");
      setState("idle");
      return;
    }
    startedAt.current = Date.now();
    setElapsed(0);
    setState("recording");
  }, [finishPart]);

  /** Arrête l'enregistrement ; résout avec la transcription et l'audio. */
  const stop = useCallback((): Promise<VoiceResult> => {
    return new Promise((resolve) => {
      resolver.current = resolve;
      setState("processing");
      if (recorder.current?.state === "recording") recorder.current.stop();
      recognition.current?.stop();
      recognition.current = null;
    });
  }, []);

  useEffect(
    () => () => {
      recognition.current?.abort();
      if (recorder.current?.state === "recording") recorder.current.stop();
      stream.current?.getTracks().forEach((t) => t.stop());
    },
    [],
  );

  return { state, partial, error, elapsed, support, transcribing, start, stop, maxSeconds: MAX_SECONDS };
}
