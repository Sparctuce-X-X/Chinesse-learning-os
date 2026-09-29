"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { startConversationAction } from "@/app/actions";
import { cn } from "@/lib/utils";

export function ScenarioPicker({ scenarios, disabled }: { scenarios: { value: string; label: string; emoji: string }[]; disabled: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [chosen, setChosen] = useState<string | null>(null);
  return (
    <div>
      <h2 className="mb-3 text-sm font-semibold">Choisis une situation</h2>
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {scenarios.map((s) => (
          <li key={s.value}>
            <button
              disabled={disabled || pending}
              onClick={() => {
                setChosen(s.value);
                start(async () => {
                  const res = await startConversationAction(s.value);
                  if (!res.ok) {
                    toast.error(res.error);
                    setChosen(null);
                    return;
                  }
                  router.push(`/conversation/${res.data.id}`);
                });
              }}
              className={cn(
                "flex min-h-20 w-full flex-col items-start justify-center gap-1 rounded-xl border bg-card px-4 py-3 text-left transition",
                "hover:border-primary/50 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50",
                chosen === s.value && "border-primary",
              )}
            >
              <span className="text-xl" aria-hidden>
                {s.emoji}
              </span>
              <span className="flex items-center gap-2 text-sm font-medium">
                {s.label}
                {pending && chosen === s.value && <Loader2 className="size-4 animate-spin" aria-hidden />}
              </span>
            </button>
          </li>
        ))}
      </ul>
      {pending && <p className="mt-3 text-sm text-muted-foreground" role="status">L&apos;IA prépare la situation…</p>}
    </div>
  );
}
