"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { reanalyzeLessonAction } from "@/app/actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export function ReanalyzeButton({ lessonId }: { lessonId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <RefreshCw /> Ré-analyser
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Ré-analyser ce cours ?</DialogTitle>
          <DialogDescription>
            Le PDF sera analysé à nouveau et tu pourras valider le résultat. Tes connaissances et ton historique de révision sont conservés ; les éléments déjà connus seront simplement rattachés.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Annuler</Button>
          </DialogClose>
          <Button
            disabled={pending}
            onClick={() =>
              start(async () => {
                const res = await reanalyzeLessonAction(lessonId);
                if (!res.ok) toast.error(res.error);
                setOpen(false);
                router.refresh();
              })
            }
          >
            Ré-analyser
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
