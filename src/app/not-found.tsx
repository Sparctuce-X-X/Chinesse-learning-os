import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-3 px-4 text-center">
      <p lang="zh-CN" className="font-hanzi text-6xl text-muted-foreground">迷路</p>
      <h1 className="text-lg font-semibold">Page introuvable</h1>
      <p className="text-sm text-muted-foreground">Cette page n&apos;existe pas ou a été supprimée.</p>
      <Button asChild>
        <Link href="/">Retour à l&apos;accueil</Link>
      </Button>
    </div>
  );
}
