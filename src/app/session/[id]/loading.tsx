import { Loader2 } from "lucide-react";

export default function Loading() {
  return (
    <div className="flex min-h-dvh items-center justify-center gap-2 text-muted-foreground" role="status">
      <Loader2 className="size-5 animate-spin" aria-hidden /> Préparation de la session…
    </div>
  );
}
