"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { classifyThemesAction } from "@/app/actions";
import { Button } from "@/components/ui/button";

export function RetryUnthemedButton() {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button
      disabled={pending}
      onClick={() =>
        start(async () => {
          const res = await classifyThemesAction({ includeUnthemed: true });
          if (!res.ok) return void toast.error(res.error);
          toast.success("Rangement lancé : suis son avancement sur la page Thèmes.");
          router.push("/themes");
        })
      }
    >
      {pending ? <Loader2 className="animate-spin" /> : <Sparkles />} Ranger avec l&apos;IA
    </Button>
  );
}
