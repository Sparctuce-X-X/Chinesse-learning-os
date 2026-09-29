"use client";

import { useFormStatus } from "react-dom";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

type Props = React.ComponentProps<typeof Button> & { pendingLabel?: string };

export function SubmitButton({ children, pendingLabel, disabled, ...props }: Props) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending || disabled} aria-busy={pending} {...props}>
      {pending ? (
        <>
          <Loader2 className="animate-spin" aria-hidden /> {pendingLabel ?? children}
        </>
      ) : (
        children
      )}
    </Button>
  );
}
