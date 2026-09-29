"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, Volume2 } from "lucide-react";
import { toast } from "sonner";
import { saveVoiceAction } from "@/app/actions";
import type { TtsVoice } from "@/lib/audio/voices";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const SAMPLE = "你好！我们开始学习中文吧。只要有手机，就可以付款。";

/** Choix de la voix de synthèse, avec écoute d'essai. */
export function VoicePicker({ current, voices }: { current: string; voices: TtsVoice[] }) {
  const router = useRouter();
  const [selected, setSelected] = useState(current);
  const [playing, setPlaying] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const preview = (voice: string) => {
    setPlaying(voice);
    const audio = new Audio(`/api/tts?${new URLSearchParams({ text: SAMPLE, voice })}`);
    audio.onended = () => setPlaying(null);
    audio.onerror = () => {
      setPlaying(null);
      toast.error("Impossible de générer cette voix pour le moment (service vocal injoignable ou mal configuré). La voix du navigateur sera utilisée.");
    };
    audio.play().catch(() => setPlaying(null));
  };

  const choose = (voice: string) => {
    setSelected(voice);
    start(async () => {
      const res = await saveVoiceAction(voice);
      if (!res.ok) toast.error(res.error);
      else toast.success(`Voix « ${voices.find((v) => v.id === voice)?.label ?? voice} » enregistrée.`);
      router.refresh();
    });
  };

  return (
    <ul className="grid gap-2 sm:grid-cols-2" aria-label="Voix disponibles">
      {voices.map((v) => {
        const active = selected === v.id;
        return (
          <li key={v.id} className={cn("flex items-center justify-between gap-2 rounded-xl border px-3 py-2", active && "border-primary bg-accent/40")}>
            <span className="text-sm">
              <span className="font-medium">{v.label}</span>{" "}
              <span className="text-muted-foreground">
                · {v.gender}
                {v.style ? `, ${v.style}` : ""}
              </span>
            </span>
            <span className="flex gap-1">
              <Button type="button" variant="ghost" size="sm" onClick={() => preview(v.id)} aria-label={`Écouter la voix ${v.label}`}>
                {playing === v.id ? <Loader2 className="animate-spin" /> : <Volume2 />} Écouter
              </Button>
              <Button type="button" variant={active ? "secondary" : "outline"} size="sm" onClick={() => choose(v.id)} disabled={pending} aria-pressed={active}>
                {active && <Check />} {active ? "Choisie" : "Choisir"}
              </Button>
            </span>
          </li>
        );
      })}
    </ul>
  );
}
