"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, EyeOff, Gauge, ListVideo, Plus, Repeat, X } from "lucide-react";
import { toast } from "sonner";
import { setWordKnownAction } from "@/app/actions";
import { hskLevelLabel } from "@/lib/chinese/hsk-levels";
import { activeSegment, formatTime } from "@/lib/resources/video";
import type { ReaderData, ReaderWord } from "@/server/resources";
import { Button } from "@/components/ui/button";
import { SpeakButton } from "@/components/speak-button";
import { cn } from "@/lib/utils";

/** Demande au lecteur vidéo de la page d'aller à un moment précis (ex. bouton « ▶ 1:23 » d'un mot). */
export function seekVideo(time: number) {
  window.dispatchEvent(new CustomEvent("clos:seek", { detail: { time } }));
}

interface YTPlayer {
  seekTo(seconds: number, allowSeekAhead: boolean): void;
  playVideo(): void;
  getCurrentTime(): number;
  getPlayerState(): number;
  setPlaybackRate(rate: number): void;
  destroy(): void;
}
interface YTNamespace {
  Player: new (
    el: HTMLElement,
    opts: {
      videoId: string;
      host?: string;
      playerVars?: Record<string, number | string>;
      events?: {
        onReady?: () => void;
        onStateChange?: (e: { data: number }) => void;
        onError?: (e: { data: number }) => void;
      };
    },
  ) => YTPlayer;
}
declare global {
  interface Window {
    YT?: YTNamespace & { loaded?: number };
    onYouTubeIframeAPIReady?: () => void;
  }
}

let apiPromise: Promise<YTNamespace> | null = null;
function loadYouTubeApi(): Promise<YTNamespace> {
  if (window.YT?.Player && window.YT.loaded) return Promise.resolve(window.YT);
  if (!apiPromise) {
    apiPromise = new Promise((resolve, reject) => {
      const previous = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => {
        previous?.();
        if (window.YT) resolve(window.YT);
      };
      const script = document.createElement("script");
      script.src = "https://www.youtube.com/iframe_api";
      script.async = true;
      script.onerror = () => {
        apiPromise = null;
        reject(new Error("youtube"));
      };
      document.head.appendChild(script);
    });
  }
  return apiPromise;
}

const PLAYING = 1;

const SOURCE_LABEL: Record<NonNullable<ReaderWord["meaningSource"]>, string> = {
  AI: "sens proposé par l'IA pour ce texte",
  USER: "sens saisi par toi",
  MINE: "dans tes connaissances",
  HSK: "anglais, dictionnaire HSK",
};

/**
 * Lecteur interactif : vidéo YouTube + transcription synchronisée (réplique en cours surlignée,
 * clic sur l'horodatage pour y aller), mots cliquables avec leur fiche.
 */
export function VideoReader({
  data,
  selection,
  onAdd,
  onKnown,
}: {
  data: ReaderData;
  /** Tri en cours : mots de la liste (cochés ou non). */
  selection?: Map<string, "approved" | "pending">;
  /** Ajoute (ou coche) un mot dans la sélection du tri. */
  onAdd?: (word: string) => void;
  /** Un mot vient d'être déclaré connu (le tri le retire de sa liste). */
  onKnown?: (word: string) => void;
}) {
  const cardRef = useRef<HTMLDivElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<YTPlayer | null>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const [time, setTime] = useState(0);
  const [follow, setFollow] = useState(true);
  const [slow, setSlow] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [picked, setPicked] = useState<{ word: string; seg: number } | null>(null);
  const [knownNow, setKnownNow] = useState<Set<string>>(() => new Set());

  // Lecteur YouTube (API officielle, domaine sans cookies publicitaires).
  useEffect(() => {
    let cancelled = false;
    let poll: ReturnType<typeof setInterval> | undefined;
    const timeout = setTimeout(() => {
      if (!playerRef.current) setFailed("La vidéo ne se charge pas (connexion internet ?). La transcription reste utilisable.");
    }, 15_000);
    loadYouTubeApi()
      .then((YT) => {
        if (cancelled || !hostRef.current) return;
        const target = document.createElement("div");
        hostRef.current.replaceChildren(target);
        playerRef.current = new YT.Player(target, {
          videoId: data.videoId,
          host: "https://www.youtube-nocookie.com",
          playerVars: {
            rel: 0,
            playsinline: 1,
            modestbranding: 1,
            cc_load_policy: 0,
            hl: "fr",
          },
          events: {
            onReady: () => {
              clearTimeout(timeout);
              setReady(true);
              setFailed(null);
            },
            onStateChange: (e) => {
              clearInterval(poll);
              if (e.data === PLAYING) {
                poll = setInterval(() => setTime(playerRef.current?.getCurrentTime() ?? 0), 250);
              }
              setTime(playerRef.current?.getCurrentTime() ?? 0);
            },
            onError: (e) =>
              setFailed(
                e.data === 101 || e.data === 150
                  ? "L'auteur de cette vidéo n'autorise pas sa lecture en dehors de YouTube : ouvre-la sur YouTube, la transcription reste utilisable ici."
                  : "La vidéo ne peut pas être lue ici. La transcription reste utilisable.",
              ),
          },
        });
      })
      .catch(() => setFailed("Le lecteur YouTube n'a pas pu être chargé (connexion internet ?). La transcription reste utilisable."));
    return () => {
      cancelled = true;
      clearTimeout(timeout);
      clearInterval(poll);
      playerRef.current?.destroy();
      playerRef.current = null;
    };
  }, [data.videoId]);

  const seek = useCallback((t: number, play = true) => {
    const p = playerRef.current;
    setTime(t);
    if (!p) return;
    p.seekTo(Math.max(0, t - 0.2), true);
    if (play) p.playVideo();
  }, []);

  // Demandes venant du reste de la page (bouton « ▶ » d'un mot).
  useEffect(() => {
    const onSeek = (e: Event) => {
      const t = (e as CustomEvent<{ time: number }>).detail?.time;
      if (typeof t !== "number") return;
      const rect = cardRef.current?.getBoundingClientRect();
      if (rect && (rect.top < 0 || rect.top > window.innerHeight * 0.6)) cardRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      setFollow(true);
      seek(t);
    };
    window.addEventListener("clos:seek", onSeek);
    return () => window.removeEventListener("clos:seek", onSeek);
  }, [seek]);

  const active = useMemo(() => activeSegment(data.segments, time), [data.segments, time]);

  // La réplique en cours reste visible dans la transcription (sans faire défiler la page).
  useEffect(() => {
    if (!follow || active < 0) return;
    const list = listRef.current;
    const row = list?.querySelector<HTMLElement>(`[data-seg="${active}"]`);
    if (!list || !row) return;
    // La liste est positionnée (relative) : offsetTop de la ligne est relatif à la liste.
    const top = row.offsetTop;
    if (top < list.scrollTop + 8 || top + row.offsetHeight > list.scrollTop + list.clientHeight - 8) {
      list.scrollTo({
        top: Math.max(0, top - list.clientHeight / 3),
        behavior: "smooth",
      });
    }
  }, [active, follow]);

  const statusOf = (w: string): ReaderWord["status"] => (knownNow.has(w) ? "known" : (data.words[w]?.status ?? "new"));

  const markKnown = async (word: string) => {
    const res = await setWordKnownAction(word, true);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    setKnownNow((s) => new Set(s).add(word));
    onKnown?.(word);
    toast.success(`« ${word} » compté comme connu`, {
      action: {
        label: "Annuler",
        onClick: async () => {
          await setWordKnownAction(word, false);
          setKnownNow((s) => {
            const n = new Set(s);
            n.delete(word);
            return n;
          });
        },
      },
    });
  };

  const onTextClick = (e: React.MouseEvent<HTMLElement>) => {
    const el = (e.target as HTMLElement).closest<HTMLElement>("[data-w]");
    if (!el) return;
    setPicked({
      word: el.dataset.w!,
      seg: Number(el.closest<HTMLElement>("[data-seg]")?.dataset.seg ?? -1),
    });
  };

  const wordClass = (w: string) => {
    const sel = selection?.get(w);
    if (sel === "approved") return "rounded-sm bg-primary/15 underline decoration-primary decoration-2 underline-offset-4";
    if (sel === "pending") return "underline decoration-primary/60 decoration-dotted decoration-2 underline-offset-4";
    if (statusOf(w) === "new") return "underline decoration-muted-foreground/50 decoration-dotted underline-offset-4";
    return "";
  };

  const info = picked ? data.words[picked.word] : null;
  const pickedStatus = picked ? statusOf(picked.word) : null;
  const pickedSel = picked ? selection?.get(picked.word) : undefined;
  const repeatFrom = picked && picked.seg >= 0 ? picked.seg : active;

  return (
    <section ref={cardRef} aria-label="Lecteur vidéo et transcription" className="scroll-mt-4 overflow-hidden rounded-2xl border bg-card">
      <div className="relative aspect-video w-full bg-black [&_iframe]:size-full">
        <div ref={hostRef} className="size-full" />
        {failed && (
          <div className="absolute inset-0 flex items-center justify-center bg-muted p-6 text-center text-sm text-muted-foreground">
            <p>
              {failed}{" "}
              <a className="underline" href={`https://www.youtube.com/watch?v=${data.videoId}`} target="_blank" rel="noreferrer noopener">
                Ouvrir sur YouTube
              </a>
            </p>
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-1.5 border-b px-3 py-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={!ready || repeatFrom < 0}
          onClick={() => repeatFrom >= 0 && seek(data.segments[repeatFrom].s)}
          title="Réécouter la phrase en cours (ou celle du mot choisi)"
        >
          <Repeat aria-hidden /> Réécouter la phrase
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={!ready}
          aria-pressed={slow}
          className={cn(slow && "bg-muted")}
          onClick={() => {
            playerRef.current?.setPlaybackRate(slow ? 1 : 0.75);
            setSlow((s) => !s);
          }}
        >
          <Gauge aria-hidden /> {slow ? "Vitesse 0,75×" : "Vitesse 1×"}
        </Button>
        <Button type="button" variant="ghost" size="sm" aria-pressed={follow} className={cn(follow && "bg-muted")} onClick={() => setFollow((f) => !f)}>
          <ListVideo aria-hidden /> Suivre la vidéo
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-pressed={hidden}
          className={cn(hidden && "bg-muted")}
          onClick={() => setHidden((h) => !h)}
          title="Masque le texte pour t'entraîner à l'écoute (survole une ligne pour la voir)"
        >
          <EyeOff aria-hidden /> Écoute seule
        </Button>
      </div>

      {picked && info && (
        <div className="flex flex-wrap items-start gap-3 border-b bg-muted/40 px-4 py-3" aria-live="polite">
          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span lang="zh-CN" className="font-cjk text-2xl font-medium">
                {picked.word}
              </span>
              {info.pinyin && <span className="text-sm text-muted-foreground">{info.pinyin}</span>}
              <SpeakButton text={picked.word} size="icon-sm" label={`Écouter ${picked.word}`} />
            </div>
            <p className="text-sm">
              {info.meaning ?? <span className="text-muted-foreground">Sens inconnu</span>}
              {info.meaningSource && <span className="text-xs text-muted-foreground"> · {SOURCE_LABEL[info.meaningSource]}</span>}
            </p>
            <p className="text-xs text-muted-foreground">
              {info.hsk ? hskLevelLabel(info.hsk) : "Hors HSK"} ·{" "}
              {pickedStatus === "known" ? "tu le connais" : pickedStatus === "presumed" ? "supposé connu (ton niveau)" : "nouveau pour toi"}
              {pickedSel === "approved" ? " · dans ta sélection" : pickedSel === "pending" ? " · proposé, non coché" : ""}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {onAdd && pickedStatus !== "known" && pickedSel !== "approved" && (
              <Button type="button" size="sm" onClick={() => onAdd(picked.word)}>
                <Plus aria-hidden /> Ajouter à ma sélection
              </Button>
            )}
            {pickedStatus !== "known" && (
              <Button type="button" size="sm" variant="outline" onClick={() => void markKnown(picked.word)}>
                <Check aria-hidden /> Je le connais
              </Button>
            )}
            <Button type="button" size="icon-sm" variant="ghost" onClick={() => setPicked(null)} aria-label="Fermer la fiche du mot">
              <X aria-hidden />
            </Button>
          </div>
        </div>
      )}

      <div ref={listRef} className="relative max-h-[22rem] overflow-y-auto px-2 py-2 sm:max-h-[26rem]">
        {data.segments.map((seg, i) => (
          <div key={i} data-seg={i} className={cn("group flex gap-2 rounded-lg px-2 py-1.5 transition-colors", i === active && "bg-primary/10")}>
            <button
              type="button"
              onClick={() => seek(seg.s)}
              className="mt-0.5 shrink-0 rounded px-1 font-mono text-xs tabular-nums text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label={`Aller à ${formatTime(seg.s)}`}
            >
              {formatTime(seg.s)}
            </button>
            <p
              lang="zh-CN"
              onClick={onTextClick}
              className={cn(
                "font-cjk text-lg leading-relaxed",
                hidden && i !== active && "blur-sm group-hover:blur-none",
                hidden && i === active && "blur-[3px] group-hover:blur-none",
              )}
            >
              {seg.parts.map((p, j) =>
                typeof p === "string" ? (
                  <span key={j}>{p}</span>
                ) : (
                  <span
                    key={j}
                    data-w={p[0]}
                    className={cn("cursor-pointer hover:bg-primary/10", wordClass(p[0]), picked?.word === p[0] && "outline outline-2 outline-primary/60")}
                  >
                    {p[0]}
                  </span>
                ),
              )}
            </p>
          </div>
        ))}
      </div>
      <p className="border-t px-4 py-2 text-xs text-muted-foreground">
        Clique sur un mot pour voir sa fiche.{" "}
        {selection ? (
          <>
            <span className="rounded-sm bg-primary/15 px-1 underline decoration-primary decoration-2 underline-offset-4">Surligné</span> : dans ta sélection ·{" "}
            <span className="underline decoration-muted-foreground/60 decoration-dotted underline-offset-4">pointillés</span> : nouveau pour toi.
          </>
        ) : (
          <>
            <span className="underline decoration-muted-foreground/60 decoration-dotted underline-offset-4">Pointillés</span> : nouveau pour toi.
          </>
        )}
      </p>
    </section>
  );
}
