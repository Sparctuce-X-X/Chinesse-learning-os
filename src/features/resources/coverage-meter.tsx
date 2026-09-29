import type { CoverageStats } from "@/lib/resources/analyze";
import { coverageVerdict } from "@/lib/resources/analyze";
import { hskLevelLabel } from "@/lib/chinese/hsk-levels";
import { cn } from "@/lib/utils";

/**
 * Taux de mots connus d'une ressource : tes connaissances, les mots supposés connus
 * (niveau HSK) et les mots inconnus. Zone idéale pour progresser : 90–95 %.
 */
export function CoverageMeter({
  stats,
  hskLevel,
  className,
}: {
  stats: CoverageStats;
  hskLevel: number;
  className?: string;
}) {
  const verdict = coverageVerdict(stats.coverage);
  const pct = (n: number) => (stats.tokens ? (n / stats.tokens) * 100 : 0);
  return (
    <div className={cn("space-y-3", className)}>
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="text-3xl font-semibold tabular-nums">
            {stats.coverage} %
          </p>
          <p className="text-sm text-muted-foreground">
            des mots du texte sont connus
          </p>
        </div>
        <span
          className={cn(
            "rounded-full px-2.5 py-1 text-xs font-medium",
            verdict.tone === "good"
              ? "bg-success-soft text-success"
              : verdict.tone === "hard"
                ? "bg-warning-soft text-warning"
                : "bg-muted text-muted-foreground",
          )}
        >
          {verdict.label}
        </span>
      </div>
      <div
        className="flex h-2.5 gap-0.5 overflow-hidden rounded-full bg-muted"
        aria-hidden
      >
        <span
          className="h-full bg-primary"
          style={{ width: `${pct(stats.known)}%` }}
        />
        <span
          className="h-full bg-primary/40"
          style={{ width: `${pct(stats.presumed)}%` }}
        />
      </div>
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <li className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-full bg-primary" aria-hidden /> Dans
          tes connaissances : {stats.coverageOwn} %
        </li>
        <li className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-full bg-primary/40" aria-hidden />{" "}
          Supposés connus ({hskLevelLabel(hskLevel)} et moins) :{" "}
          {Math.round(pct(stats.presumed))} %
        </li>
        <li className="flex items-center gap-1.5">
          <span
            className="size-2.5 rounded-full bg-muted-foreground/30"
            aria-hidden
          />{" "}
          Inconnus : {Math.round(pct(stats.unknown))} %
        </li>
      </ul>
      <p className="text-xs text-muted-foreground">
        {stats.tokens} mots, {stats.uniqueWords} différents. Idéal pour
        progresser : 90 à 95 % de mots connus.
      </p>
    </div>
  );
}
