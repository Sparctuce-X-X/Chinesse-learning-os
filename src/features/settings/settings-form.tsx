"use client";

import { useActionState, useEffect } from "react";
import { toast } from "sonner";
import { saveSettingsAction, type ActionResult } from "@/app/actions";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SubmitButton } from "@/components/submit-button";

interface Values {
  name: string;
  dailyGoalMinutes: number;
  newItemsPerSession: number;
  newItemsPerDay: number;
  maxReviewsPerSession: number;
}

export function SettingsForm({ initial }: { initial: Values }) {
  const [state, action] = useActionState<ActionResult | null, FormData>(saveSettingsAction, null);
  useEffect(() => {
    if (!state) return;
    if (state.ok) toast.success("Paramètres enregistrés.");
    else toast.error(state.error);
  }, [state]);

  return (
    <form action={action} className="grid gap-4 sm:grid-cols-2">
      <div className="space-y-1.5">
        <Label htmlFor="name">Prénom</Label>
        <Input id="name" name="name" defaultValue={initial.name} maxLength={40} required />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="dailyGoalMinutes">Durée cible d&apos;une session (minutes)</Label>
        <Input id="dailyGoalMinutes" name="dailyGoalMinutes" type="number" min={3} max={60} defaultValue={initial.dailyGoalMinutes} required />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="newItemsPerSession">Nouvelles notions par session</Label>
        <Input id="newItemsPerSession" name="newItemsPerSession" type="number" min={0} max={30} defaultValue={initial.newItemsPerSession} required />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="newItemsPerDay">Nouvelles notions par jour (maximum)</Label>
        <Input id="newItemsPerDay" name="newItemsPerDay" type="number" min={0} max={50} defaultValue={initial.newItemsPerDay} required />
        <p className="text-xs text-muted-foreground">Chaque notion revient ensuite en révision : 10 par jour reste tenable sur la durée.</p>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="maxReviewsPerSession">Révisions maximum par session</Label>
        <Input id="maxReviewsPerSession" name="maxReviewsPerSession" type="number" min={5} max={100} defaultValue={initial.maxReviewsPerSession} required />
      </div>
      <div className="sm:col-span-2">
        <SubmitButton pendingLabel="Enregistrement…">Enregistrer</SubmitButton>
      </div>
    </form>
  );
}
