import { BarChart3 } from "lucide-react";
import { getProgress, type WeekStats } from "@/server/progress";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState, formatDate, PageHeader } from "@/components/page";

export const dynamic = "force-dynamic";
export const metadata = { title: "Progression" };

function Delta({ now, before }: { now: number; before: number }) {
  if (now === before || (now === 0 && before === 0)) return null;
  const up = now > before;
  return (
    <span className={up ? "text-success" : "text-muted-foreground"}>
      {up ? "▲" : "▼"} {Math.abs(now - before)} vs semaine précédente
    </span>
  );
}

function WeekTile({ label, value, prev, suffix = "" }: { label: string | [string, string]; value: number; prev?: number; suffix?: string }) {
  const text = Array.isArray(label) ? (value > 1 ? label[1] : label[0]) : label;
  return (
    <div className="rounded-xl bg-muted/60 px-4 py-3">
      <div className="text-2xl font-semibold tabular-nums">
        {value}
        {suffix}
      </div>
      <div className="text-xs text-muted-foreground">{text}</div>
      {prev !== undefined && (
        <div className="mt-0.5 text-[11px]">
          <Delta now={value} before={prev} />
        </div>
      )}
    </div>
  );
}

export default async function ProgressPage() {
  const p = await getProgress();
  const w: WeekStats = p.week;
  const max = Math.max(1, ...p.daily.map((d) => d.reviews));
  const retention = p.productionRetention.eligible ? Math.round((p.productionRetention.recalled / p.productionRetention.eligible) * 100) : null;

  if (p.allTime.knowledge === 0) {
    return (
      <div>
        <PageHeader title="Progression" />
        <EmptyState icon={BarChart3} title="Pas encore de données" description="Importe un cours et fais ta première session : ta progression apparaîtra ici." />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Progression" description="Uniquement des indicateurs utiles : rappel, régularité, production." />

      <section aria-labelledby="week">
        <h2 id="week" className="mb-3 text-sm font-semibold">Cette semaine</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <WeekTile label={["jour travaillé", "jours travaillés"]} value={w.daysStudied} prev={p.previousWeek.daysStudied} />
          <WeekTile label={["révision", "révisions"]} value={w.reviews} prev={p.previousWeek.reviews} />
          <WeekTile label={["minute", "minutes"]} value={w.minutes} prev={p.previousWeek.minutes} />
          <WeekTile label={["minute d'oral", "minutes d'oral"]} value={w.speakingMinutes} />
          <WeekTile label={["notion consolidée", "notions consolidées"]} value={w.consolidated} />
          <WeekTile label="taux de rappel" value={w.recallRate ?? 0} suffix={w.recallRate === null ? "" : " %"} />
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Révisions par jour (14 derniers jours)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex h-40 items-end gap-1 border-b border-border" role="img" aria-label="Nombre de révisions par jour sur 14 jours">
              {p.daily.map((d) => (
                <div key={d.date} className="group relative flex h-full flex-1 items-end">
                  <div
                    className="w-full rounded-t-[4px] bg-primary transition-opacity group-hover:opacity-80"
                    style={{ height: d.reviews ? `${Math.max(3, (d.reviews / max) * 100)}%` : "0" }}
                  />
                  <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 hidden -translate-x-1/2 whitespace-nowrap rounded-md border bg-popover px-2 py-1 text-xs shadow-sm group-hover:block">
                    <div className="font-medium">{formatDate(d.date, { weekday: "short", day: "numeric", month: "short" })}</div>
                    <div>{d.reviews} révisions · {d.correct} correctes</div>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-1 flex justify-between text-[11px] text-muted-foreground">
              <span>{formatDate(p.daily[0].date, { day: "numeric", month: "short" })}</span>
              <span>aujourd&apos;hui</span>
            </div>
            <table className="sr-only">
              <caption>Révisions par jour</caption>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Révisions</th>
                  <th>Correctes</th>
                </tr>
              </thead>
              <tbody>
                {p.daily.map((d) => (
                  <tr key={d.date}>
                    <td>{d.date}</td>
                    <td>{d.reviews}</td>
                    <td>{d.correct}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Production à long terme</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-4xl font-semibold tabular-nums">{retention === null ? "—" : `${retention} %`}</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {retention === null
                ? "Des notions apprises il y a plus de 3 semaines et retestées en production apparaîtront ici."
                : `des notions apprises il y a plus de 3 semaines sont encore produites correctement (${p.productionRetention.recalled}/${p.productionRetention.eligible}).`}
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Maîtrise par dimension</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-3 text-sm">
              {p.dimensions.map((d) => (
                <li key={d.label}>
                  <div className="mb-1 flex justify-between">
                    <span>{d.label}</span>
                    <span className="tabular-nums text-muted-foreground">{d.tested ? `${d.average} / 100 · ${d.tested} notions testées` : "pas encore testé"}</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-muted" aria-hidden>
                    <div className="h-full rounded-full bg-primary" style={{ width: `${d.average}%` }} />
                  </div>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Vue d&apos;ensemble</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-2 gap-y-2 text-sm">
              <dt className="text-muted-foreground">Connaissances</dt>
              <dd className="tabular-nums">{p.allTime.knowledge}</dd>
              <dt className="text-muted-foreground">Déjà révisées</dt>
              <dd className="tabular-nums">{p.allTime.learned}</dd>
              <dt className="text-muted-foreground">Dues aujourd&apos;hui</dt>
              <dd className="tabular-nums">{p.due.today}</dd>
              <dt className="text-muted-foreground">Dues cette semaine</dt>
              <dd className="tabular-nums">{p.due.week}</dd>
              <dt className="text-muted-foreground">Erreurs récurrentes</dt>
              <dd className="tabular-nums">{p.recurringMistakes}</dd>
              <dt className="text-muted-foreground">Jours étudiés</dt>
              <dd className="tabular-nums">{p.allTime.daysStudied}</dd>
              <dt className="text-muted-foreground">Sessions terminées</dt>
              <dd className="tabular-nums">{p.allTime.sessions}</dd>
              <dt className="text-muted-foreground">Temps total</dt>
              <dd className="tabular-nums">{p.allTime.minutes} min</dd>
            </dl>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
