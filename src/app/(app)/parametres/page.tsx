import { Bot, Database, Volume2 } from "lucide-react";
import { getAIStatus } from "@/lib/ai";
import { getUser } from "@/server/user";
import { dataDir } from "@/server/storage";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/page";
import { SettingsForm } from "@/features/settings/settings-form";
import { AudioCheck } from "@/features/settings/audio-check";
import { VoicePicker } from "@/features/settings/voice-picker";
import { activeTtsProvider, getUserVoice } from "@/server/tts";
import { PROVIDER_LABEL, VOICES } from "@/lib/audio/voices";

export const dynamic = "force-dynamic";
export const metadata = { title: "Paramètres" };

export default async function SettingsPage() {
  const [user, ai, voice] = await Promise.all([getUser(), getAIStatus(), getUserVoice()]);
  const ttsProvider = activeTtsProvider();
  return (
    <div className="space-y-6">
      <PageHeader title="Paramètres" />
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Sessions</CardTitle>
          <CardDescription>La durée et le nombre de nouveautés sont adaptés automatiquement si tu as du retard. Une fois le plafond du jour atteint, les sessions suivantes ne proposent plus que des révisions.</CardDescription>
        </CardHeader>
        <CardContent>
          <SettingsForm
            initial={{
              name: user.name,
              dailyGoalMinutes: user.dailyGoalMinutes,
              newItemsPerSession: user.newItemsPerSession,
              newItemsPerDay: user.newItemsPerDay,
              maxReviewsPerSession: user.maxReviewsPerSession,
            }}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Bot className="size-4" aria-hidden /> Intelligence artificielle
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p className="flex items-center gap-2">
            <span className={`size-2.5 rounded-full ${ai.available ? "bg-success" : "bg-destructive"}`} aria-hidden />
            <strong>{ai.available ? "Disponible" : "Indisponible"}</strong> · {ai.label}
          </p>
          {ai.reason && <p className="text-muted-foreground">{ai.reason}</p>}
          <div className="rounded-lg bg-muted/60 p-3 text-muted-foreground">
            <p className="mb-1 font-medium text-foreground">Configuration (fichier .env)</p>
            <ul className="list-disc space-y-1 pl-4">
              <li>
                <code>AI_PROVIDER=claude-cli</code> : utilise ton abonnement Claude via Claude Code (aucune clé API). Lance <code>claude</code> une fois pour te connecter.
              </li>
              <li>
                <code>AI_PROVIDER=anthropic</code> + <code>ANTHROPIC_API_KEY</code> : API Anthropic payante à l&apos;usage.
              </li>
              <li>
                <code>AI_PROVIDER=none</code> : sans IA. L&apos;import utilise l&apos;extraction simple et tu t&apos;auto-évalues.
              </li>
            </ul>
          </div>
          <p className="text-muted-foreground">Utilisée pour : analyse des PDF, correction des réponses libres, feedback oral, conversations.</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Volume2 className="size-4" aria-hidden /> Audio
          </CardTitle>
          <CardDescription>
            {ttsProvider
              ? "Voix chinoise naturelle générée par le serveur. Chaque phrase est générée une fois puis gardée sur ton disque."
              : "Voix du navigateur (synthèse serveur désactivée)."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-2 text-sm">
            <p className="flex items-center gap-2">
              <span className={`size-2.5 rounded-full ${ttsProvider ? "bg-success" : "bg-muted-foreground/50"}`} aria-hidden />
              <strong>{ttsProvider ? PROVIDER_LABEL[ttsProvider] : "Synthèse serveur désactivée"}</strong>
            </p>
            {ttsProvider ? (
              <>
                <VoicePicker current={voice ?? ""} voices={VOICES[ttsProvider]} />
                {ttsProvider === "edge" && (
                  <p className="text-xs text-muted-foreground">
                    Service de lecture à voix haute de Microsoft Edge : gratuit et sans compte, mais non officiel. S&apos;il cesse de
                    fonctionner, la voix du navigateur prend le relais et les phrases déjà générées restent disponibles.
                  </p>
                )}
              </>
            ) : (
              <p className="rounded-lg bg-muted/60 p-3 text-muted-foreground">
                Dans <code>.env</code> : <code>TTS_PROVIDER=&quot;edge&quot;</code> (sans clé) ou <code>TTS_PROVIDER=&quot;google&quot;</code> avec{" "}
                <code>GOOGLE_TTS_API_KEY</code>, puis redémarre l&apos;application.
              </p>
            )}
          </div>
          <div>
            <p className="mb-2 text-sm font-medium">Navigateur (repli et reconnaissance vocale)</p>
            <AudioCheck />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Database className="size-4" aria-hidden /> Données
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-1 text-sm text-muted-foreground">
          <p>Base de données : SQLite locale (<code>prisma/dev.db</code> par défaut).</p>
          <p>
            Copies des PDF et enregistrements audio : <code className="break-all">{dataDir()}</code>
          </p>
          <p>Tes fichiers d&apos;origine ne sont jamais modifiés.</p>
        </CardContent>
      </Card>
    </div>
  );
}
