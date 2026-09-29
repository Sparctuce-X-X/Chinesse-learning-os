import Link from "next/link";
import { DesktopNav, MobileNav } from "@/components/app-nav";
import { getAIStatus } from "@/lib/ai";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const ai = await getAIStatus();
  return (
    <div className="min-h-dvh md:grid md:grid-cols-[232px_1fr]">
      <aside className="hidden border-r bg-sidebar md:flex md:flex-col md:gap-8 md:px-4 md:py-6 md:sticky md:top-0 md:h-dvh">
        <Link href="/" className="flex items-center gap-2.5 px-2 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 rounded-lg">
          <span lang="zh-CN" className="font-hanzi flex size-9 items-center justify-center rounded-lg bg-primary text-lg text-primary-foreground">学</span>
          <span className="text-sm font-semibold leading-tight">
            Chinese
            <br />
            Learning OS
          </span>
        </Link>
        <DesktopNav />
        <div className="mt-auto px-2 text-xs text-muted-foreground">
          <Link href="/parametres" className="flex items-center gap-2 hover:text-foreground">
            <span className={`size-2 rounded-full ${ai.available ? "bg-success" : "bg-muted-foreground/50"}`} aria-hidden />
            {ai.available ? (ai.simulated ? "IA simulée (tests)" : "IA disponible") : "IA indisponible"}
          </Link>
        </div>
      </aside>
      <div className="min-w-0">
        {ai.simulated && (
          <div role="status" className="bg-ai-soft px-4 py-1.5 text-center text-xs font-medium text-ai">
            Mode test : les réponses de l&apos;IA sont simulées.
          </div>
        )}
        <main className="mx-auto w-full max-w-5xl px-4 pb-28 pt-6 sm:px-6 md:pb-12 md:pt-10">{children}</main>
      </div>
      <MobileNav />
    </div>
  );
}
