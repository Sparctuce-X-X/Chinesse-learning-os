"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { createThemeAction } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

export function NewThemeButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [emoji, setEmoji] = useState("");
  const [pending, start] = useTransition();
  const save = () =>
    start(async () => {
      const res = await createThemeAction({ name, emoji: emoji || null });
      if (!res.ok) return void toast.error(res.error);
      setOpen(false);
      setName("");
      setEmoji("");
      router.push(`/themes/${res.data.id}`);
    });
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Plus /> Nouveau thème
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nouveau thème</DialogTitle>
          <DialogDescription>Tu pourras y ranger des mots depuis leur fiche. L&apos;IA le réutilisera pour les prochains cours.</DialogDescription>
        </DialogHeader>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
        >
          <div className="grid grid-cols-[5rem_1fr] gap-3">
            <div className="space-y-1">
              <Label htmlFor="nt-emoji">Emoji</Label>
              <Input id="nt-emoji" value={emoji} onChange={(e) => setEmoji(e.target.value)} maxLength={8} placeholder="✈️" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="nt-name">Nom</Label>
              <Input id="nt-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} placeholder="Voyages" required />
            </div>
          </div>
          <DialogFooter>
            <Button type="submit" disabled={pending || !name.trim()}>
              Créer
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
