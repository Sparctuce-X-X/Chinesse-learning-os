"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Merge, Pencil, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { deleteThemeAction, mergeThemesAction, renameThemeAction, setItemThemeAction } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

interface ThemeInfo {
  id: string;
  name: string;
  emoji: string | null;
  description: string | null;
  total: number;
}

export function ThemeManager({ theme, others }: { theme: ThemeInfo; others: { id: string; name: string; emoji: string | null }[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [dialog, setDialog] = useState<"rename" | "merge" | "delete" | null>(null);
  const [name, setName] = useState(theme.name);
  const [emoji, setEmoji] = useState(theme.emoji ?? "");
  const [description, setDescription] = useState(theme.description ?? "");
  const [target, setTarget] = useState(others[0]?.id ?? "");

  const run = (fn: () => Promise<{ ok: true } | { ok: false; error: string }>, done: () => void) =>
    start(async () => {
      const res = await fn();
      if (!res.ok) return void toast.error(res.error);
      setDialog(null);
      done();
    });

  return (
    <div className="flex flex-wrap gap-2">
      <Dialog open={dialog === "rename"} onOpenChange={(o) => setDialog(o ? "rename" : null)}>
        <DialogTrigger asChild>
          <Button variant="outline" size="sm">
            <Pencil /> Renommer
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Renommer le thème</DialogTitle>
            <DialogDescription>Le nouveau nom sera réutilisé pour ranger les mots des prochains cours.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-[5rem_1fr] gap-3">
              <div className="space-y-1">
                <Label htmlFor="t-emoji">Emoji</Label>
                <Input id="t-emoji" value={emoji} onChange={(e) => setEmoji(e.target.value)} maxLength={8} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="t-name">Nom</Label>
                <Input id="t-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} />
              </div>
            </div>
            <div className="space-y-1">
              <Label htmlFor="t-desc">Description</Label>
              <Textarea id="t-desc" value={description} onChange={(e) => setDescription(e.target.value)} rows={2} maxLength={300} />
            </div>
          </div>
          <DialogFooter>
            <Button
              disabled={pending || !name.trim()}
              onClick={() => run(() => renameThemeAction(theme.id, { name, emoji: emoji || null, description: description || null }), () => router.refresh())}
            >
              Enregistrer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {others.length > 0 && (
        <Dialog open={dialog === "merge"} onOpenChange={(o) => setDialog(o ? "merge" : null)}>
          <DialogTrigger asChild>
            <Button variant="outline" size="sm">
              <Merge /> Fusionner
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Fusionner « {theme.name} »</DialogTitle>
              <DialogDescription>
                Ses {theme.total} élément{theme.total > 1 ? "s" : ""} rejoignent le thème choisi, puis « {theme.name} » disparaît. Aucun mot n&apos;est supprimé.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-1">
              <Label htmlFor="t-target">Fusionner dans</Label>
              <select
                id="t-target"
                value={target}
                onChange={(e) => setTarget(e.target.value)}
                className="h-9 w-full rounded-md border bg-background px-3 text-sm"
              >
                {others.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.emoji ? `${o.emoji} ` : ""}
                    {o.name}
                  </option>
                ))}
              </select>
            </div>
            <DialogFooter>
              <Button disabled={pending || !target} onClick={() => run(() => mergeThemesAction(theme.id, target), () => router.push(`/themes/${target}`))}>
                Fusionner
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      <Dialog open={dialog === "delete"} onOpenChange={(o) => setDialog(o ? "delete" : null)}>
        <DialogTrigger asChild>
          <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive">
            <Trash2 /> Supprimer
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Supprimer le thème « {theme.name} » ?</DialogTitle>
            <DialogDescription>
              Seul le thème est supprimé : tes {theme.total} élément{theme.total > 1 ? "s" : ""}, leurs révisions et leurs erreurs sont conservés.
              Ceux qui n&apos;ont pas d&apos;autre thème passent dans « Non classés ».
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog(null)}>
              Annuler
            </Button>
            <Button variant="destructive" disabled={pending} onClick={() => run(() => deleteThemeAction(theme.id), () => router.push("/themes"))}>
              Supprimer le thème
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** Retire un élément du thème (corrige un rangement de l'IA). */
export function RemoveFromThemeButton({ knowledgeItemId, themeId, label }: { knowledgeItemId: string; themeId: string; label: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      disabled={pending}
      aria-label={`Retirer ${label} du thème`}
      title="Retirer du thème"
      onClick={() =>
        start(async () => {
          const res = await setItemThemeAction(knowledgeItemId, themeId, false);
          if (!res.ok) return void toast.error(res.error);
          toast.success(`${label} retiré du thème.`);
          router.refresh();
        })
      }
    >
      <X />
    </Button>
  );
}
