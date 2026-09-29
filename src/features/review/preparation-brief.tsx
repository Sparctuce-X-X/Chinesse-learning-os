import Link from "next/link";
import { GraduationCap } from "lucide-react";
import type { PreparationBrief } from "@/server/review";
import { CATEGORY_LABEL } from "@/server/mistakes";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDate } from "@/components/page";

export function PreparationBriefCard({ brief }: { brief: PreparationBrief }) {
  return (
    <Card className="border-teacher/30">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <GraduationCap className="size-4 text-teacher" aria-hidden /> Pour ton prochain cours
        </CardTitle>
        {brief.lessonTitle && (
          <p className="text-sm text-muted-foreground">
            D&apos;après « {brief.lessonTitle} » ({formatDate(brief.lessonDate)})
          </p>
        )}
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        {brief.grammar.length > 0 && (
          <div>
            <p className="mb-1 font-medium">Structures à placer en conversation</p>
            <ul className="space-y-0.5">
              {brief.grammar.map((g) => (
                <li key={g.id}>
                  <Link href={`/connaissances/${g.id}`} lang="zh-CN" className="font-cjk hover:underline">{g.name}</Link>
                  {g.structure && <span className="text-muted-foreground"> — {g.structure}</span>}
                </li>
              ))}
            </ul>
          </div>
        )}
        {brief.fragile.length > 0 && (
          <div>
            <p className="mb-1 font-medium">Mots encore fragiles</p>
            <ul className="flex flex-wrap gap-2">
              {brief.fragile.map((f) => (
                <li key={f.id}>
                  <Link href={`/connaissances/${f.id}`} className="inline-block rounded-lg bg-muted px-2.5 py-1 hover:bg-accent">
                    <span lang="zh-CN" className="font-cjk">{f.label}</span>
                    {f.meaning && <span className="ml-1.5 text-xs text-muted-foreground">{f.meaning}</span>}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
        {brief.recurringMistakes.length > 0 && (
          <div>
            <p className="mb-1 font-medium">Erreurs récurrentes à surveiller</p>
            <ul className="space-y-0.5">
              {brief.recurringMistakes.map((m) => (
                <li key={m.id + m.category}>
                  <span lang="zh-CN">{m.label}</span> <span className="text-muted-foreground">· {CATEGORY_LABEL[m.category]}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        {brief.questions.length > 0 && (
          <div>
            <p className="mb-1 font-medium">Questions du cours pour t&apos;échauffer</p>
            <ul className="list-disc space-y-0.5 pl-5">
              {brief.questions.map((q, i) => (
                <li key={i} lang="zh-CN">{q}</li>
              ))}
            </ul>
          </div>
        )}
        <Link href="/oral" className="inline-block text-primary hover:underline">
          S&apos;entraîner à l&apos;oral →
        </Link>
      </CardContent>
    </Card>
  );
}
