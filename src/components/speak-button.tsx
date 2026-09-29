"use client";

import { useEffect, useState } from "react";
import { Volume2, Snail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getSpeechProvider } from "@/lib/audio/speech";
import { cn } from "@/lib/utils";

/** Bouton de lecture audio (synthèse vocale chinoise du navigateur). */
export function SpeakButton({
  text,
  label = "Écouter",
  size = "default",
  autoPlay = false,
  showSlow = false,
  className,
}: {
  text: string;
  label?: string;
  size?: "default" | "sm" | "lg" | "icon" | "icon-sm";
  autoPlay?: boolean;
  showSlow?: boolean;
  className?: string;
}) {
  const [supported, setSupported] = useState<boolean | null>(null);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    const sp = getSpeechProvider();
    // Détection côté client uniquement (après hydratation).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSupported(sp.canSynthesize());
    if (autoPlay && sp.canSynthesize()) {
      const t = setTimeout(() => {
        setPlaying(true);
        sp.synthesize(text, { onEnd: () => setPlaying(false) });
      }, 250);
      return () => {
        clearTimeout(t);
        sp.cancel();
      };
    }
  }, [text, autoPlay]);

  if (supported === false) {
    return <span className="text-xs text-muted-foreground">Audio indisponible dans ce navigateur</span>;
  }

  const play = (rate?: number) => {
    setPlaying(true);
    getSpeechProvider().synthesize(text, { rate, onEnd: () => setPlaying(false) });
  };

  const iconOnly = size === "icon" || size === "icon-sm";
  return (
    <span className={cn("inline-flex gap-1.5", className)}>
      <Button type="button" variant="outline" size={size} onClick={() => play()} aria-label={iconOnly ? label : undefined} disabled={supported === null}>
        <Volume2 className={cn(playing && "animate-pulse text-primary")} aria-hidden />
        {!iconOnly && label}
      </Button>
      {showSlow && (
        <Button type="button" variant="ghost" size={iconOnly ? size : "default"} onClick={() => play(0.6)} aria-label="Écouter lentement" disabled={supported === null}>
          <Snail aria-hidden />
          {!iconOnly && "Lent"}
        </Button>
      )}
    </span>
  );
}
