"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Bot, Plus, UserRound, X } from "lucide-react";
import { toast } from "sonner";
import { createThemeWithItemAction, setItemThemeAction } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface ThemeRef {
  id: string;
  name: string;
  emoji: string | null;
}

const NEW = "__new__";

/** Thèmes d'un élément : retrait, ajout à un thème existant ou nouveau. */
export function ItemThemes({
  knowledgeItemId,
  themes,
  options,
}: {
  knowledgeItemId: string;
  themes: (ThemeRef & { source: "TEACHER" | "AI" | "USER" | "EXTERNAL" })[];
  options: ThemeRef[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const available = options.filter((o) => !themes.some((t) => t.id === o.id));
  const [choice, setChoice] = useState(available.length ? "" : NEW);
  const [newName, setNewName] = useState("");

  const act = (fn: () => Promise<{ ok: true } | { ok: false; error: string }>) =>
    start(async () => {
      const res = await fn();
      if (!res.ok) return void toast.error(res.error);
      setNewName("");
      router.refresh();
    });

  const add = () =>
    act(() => (choice === NEW ? createThemeWithItemAction(knowledgeItemId, newName) : setItemThemeAction(knowledgeItemId, choice, true)));

  return (
    <div className="space-y-3 text-sm">
      {themes.length === 0 ? (
        <p className="text-muted-foreground">Pas encore de thème.</p>
      ) : (
        <ul className="flex flex-wrap gap-2">
          {themes.map((t) => (
            <li key={t.id} className="inline-flex items-center gap-1 rounded-full border bg-background py-0.5 pr-1 pl-3">
              <Link href={`/themes/${t.id}`} className="hover:underline">
                {t.emoji ? `${t.emoji} ` : ""}
                {t.name}
              </Link>
              <span title={t.source === "USER" ? "Rangé par toi" : "Rangé par l'IA"} className="text-muted-foreground">
                {t.source === "USER" ? <UserRound className="size-3" aria-hidden /> : <Bot className="size-3" aria-hidden />}
                <span className="sr-only">{t.source === "USER" ? "rangé par toi" : "rangé par l'IA"}</span>
              </span>
              <Button
                variant="ghost"
                size="icon-xs"
                className="rounded-full"
                disabled={pending}
                aria-label={`Retirer du thème ${t.name}`}
                onClick={() => act(() => setItemThemeAction(knowledgeItemId, t.id, false))}
              >
                <X />
              </Button>
            </li>
          ))}
        </ul>
      )}
      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          add();
        }}
      >
        <div className="min-w-40 flex-1 space-y-1">
          <Label htmlFor="add-theme">Ajouter à un thème</Label>
          <select id="add-theme" value={choice} onChange={(e) => setChoice(e.target.value)} className="h-9 w-full rounded-md border bg-background px-3 text-sm">
            {available.length > 0 && (
              <option value="" disabled>
                Choisir un thème…
              </option>
            )}
            {available.map((o) => (
              <option key={o.id} value={o.id}>
                {o.emoji ? `${o.emoji} ` : ""}
                {o.name}
              </option>
            ))}
            <option value={NEW}>Nouveau thème…</option>
          </select>
        </div>
        {choice === NEW && (
          <div className="min-w-40 flex-1 space-y-1">
            <Label htmlFor="new-theme-name">Nom du thème</Label>
            <Input id="new-theme-name" value={newName} onChange={(e) => setNewName(e.target.value)} maxLength={40} placeholder="Voyages" />
          </div>
        )}
        <Button type="submit" variant="outline" disabled={pending || !choice || (choice === NEW && !newName.trim())}>
          <Plus /> Ajouter
        </Button>
      </form>
    </div>
  );
}
