"use client";

import { useEffect } from "react";
import { CircleX } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-3 py-16 text-center" role="alert">
      <CircleX className="size-10 text-destructive" aria-hidden />
      <h1 className="text-lg font-semibold">Quelque chose s&apos;est mal passé</h1>
      <p className="text-sm text-muted-foreground">
        Cette page n&apos;a pas pu être affichée. Tes données sont en sécurité.
        {error.digest && <span className="block text-xs">Référence : {error.digest}</span>}
      </p>
      <Button onClick={reset}>Réessayer</Button>
    </div>
  );
}
