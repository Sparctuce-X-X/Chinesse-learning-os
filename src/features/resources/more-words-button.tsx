"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, ListPlus } from "lucide-react";
import { toast } from "sonner";
import { reanalyzeLessonAction } from "@/app/actions";
import { Button } from "@/components/ui/button";

/** Relance le tri : les mots déjà ajoutés sont connus, seuls les autres sont proposés. */
export function MoreWordsButton({
  lessonId,
  label = "Choisir d'autres mots",
}: {
  lessonId: string;
  label?: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button
      variant="outline"
      size="sm"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const res = await reanalyzeLessonAction(lessonId);
          if (!res.ok) toast.error(res.error);
          router.refresh();
        })
      }
    >
      {pending ? (
        <Loader2 className="animate-spin" aria-hidden />
      ) : (
        <ListPlus aria-hidden />
      )}{" "}
      {label}
    </Button>
  );
}
