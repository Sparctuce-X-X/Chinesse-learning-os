"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Play, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { reopenMistakeAction, resolveMistakeAction, startSessionAction } from "@/app/actions";
import { Button } from "@/components/ui/button";

export function MistakeActions({ mistakeId, knowledgeItemId, resolved }: { mistakeId: string; knowledgeItemId: string; resolved: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <div className="mt-3 flex flex-wrap justify-end gap-2">
      {resolved ? (
        <Button
          variant="ghost"
          size="sm"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const res = await reopenMistakeAction(mistakeId);
              if (!res.ok) toast.error(res.error);
              router.refresh();
            })
          }
        >
          <RotateCcw /> Réouvrir
        </Button>
      ) : (
        <Button
          variant="ghost"
          size="sm"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const res = await resolveMistakeAction(mistakeId);
              if (!res.ok) toast.error(res.error);
              else toast.success("Erreur marquée comme résolue.");
              router.refresh();
            })
          }
        >
          <Check /> Marquer comme résolue
        </Button>
      )}
      <Button
        size="sm"
        variant="secondary"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const res = await startSessionAction({ kind: "KNOWLEDGE", knowledgeItemIds: [knowledgeItemId] });
            if (!res.ok) {
              toast.error(res.error);
              return;
            }
            router.push(`/session/${res.data.id}`);
          })
        }
      >
        <Play /> Retravailler
      </Button>
    </div>
  );
}
