"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { setHskLevelAction } from "@/app/actions";
import { HSK_LEVELS, hskLevelLabel } from "@/lib/chinese/hsk-levels";

/**
 * Niveau estimé : les mots HSK de ce niveau ou en dessous sont supposés connus
 * (ils ne sont pas proposés et comptent dans le taux de mots connus).
 */
export function HskLevelSelect({
  level,
  onChanged,
}: {
  level: number;
  onChanged?: (level: number) => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <label className="flex flex-wrap items-center gap-2 text-sm">
      <span className="text-muted-foreground">Mon niveau estimé</span>
      <select
        className="h-9 rounded-md border bg-background px-2 text-sm focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
        value={level}
        disabled={pending}
        onChange={(e) => {
          const next = Number(e.target.value);
          start(async () => {
            const res = await setHskLevelAction(next);
            if (!res.ok) {
              toast.error(res.error);
              return;
            }
            onChanged?.(next);
            router.refresh();
          });
        }}
      >
        {HSK_LEVELS.map((l) => (
          <option key={l} value={l}>
            {hskLevelLabel(l)}
          </option>
        ))}
      </select>
    </label>
  );
}
