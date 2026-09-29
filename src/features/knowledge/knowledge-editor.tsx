"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pause, Pencil, PlayCircle } from "lucide-react";
import { toast } from "sonner";
import { setSuspendedAction, updateKnowledgeAction } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

interface Values {
  hanzi: string;
  pinyin: string;
  french: string;
  english: string;
  notes: string;
  name: string;
  structure: string;
  explanation: string;
}

export function KnowledgeEditor({ id, type, initial, suspended }: { id: string; type: string; initial: Values; suspended: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState(initial);
  const [pending, start] = useTransition();
  const grammar = type === "GRAMMAR";

  const field = (key: keyof Values, label: string, opts: { chinese?: boolean; multiline?: boolean } = {}) => (
    <div className="space-y-1">
      <Label htmlFor={`k-${key}`}>{label}</Label>
      {opts.multiline ? (
        <Textarea id={`k-${key}`} value={values[key]} onChange={(e) => setValues({ ...values, [key]: e.target.value })} rows={3} />
      ) : (
        <Input id={`k-${key}`} lang={opts.chinese ? "zh-CN" : undefined} value={values[key]} onChange={(e) => setValues({ ...values, [key]: e.target.value })} />
      )}
    </div>
  );

  const save = () =>
    start(async () => {
      const res = await updateKnowledgeAction(
        id,
        grammar
          ? { name: values.name, structure: values.structure, explanation: values.explanation, french: values.french, notes: values.notes }
          : { hanzi: values.hanzi, pinyin: values.pinyin, french: values.french, english: values.english, notes: values.notes },
      );
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Modifications enregistrées.");
      setOpen(false);
      router.refresh();
    });

  return (
    <>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button variant="outline">
            <Pencil /> Modifier
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Modifier la connaissance</DialogTitle>
            <DialogDescription>Les champs que tu modifies seront marqués « Moi » comme provenance. L&apos;historique de révision est conservé.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {grammar ? (
              <>
                {field("name", "Structure", { chinese: true })}
                {field("structure", "Schéma")}
                {field("explanation", "Explication", { multiline: true })}
                {field("french", "Sens en français")}
              </>
            ) : (
              <>
                {field("hanzi", "Chinois", { chinese: true })}
                {field("pinyin", "Pinyin")}
                {field("french", "Français")}
                {field("english", "Anglais")}
              </>
            )}
            {field("notes", "Notes", { multiline: true })}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Annuler
            </Button>
            <Button onClick={save} disabled={pending || (!grammar && !values.hanzi.trim()) || (grammar && !values.name.trim())}>
              Enregistrer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Button
        variant="ghost"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const res = await setSuspendedAction(id, !suspended);
            if (!res.ok) toast.error(res.error);
            else toast.success(suspended ? "Connaissance réactivée." : "Connaissance suspendue : elle n'apparaîtra plus dans les sessions.");
            router.refresh();
          })
        }
      >
        {suspended ? <PlayCircle /> : <Pause />}
        {suspended ? "Réactiver" : "Suspendre"}
      </Button>
    </>
  );
}
