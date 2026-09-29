/**
 * Vidéos (fonctions pures, utilisables côté client) : identifiant YouTube, sous-titres
 * horodatés, correspondance entre une position dans le texte et un moment de la vidéo.
 */

/** Réplique horodatée (secondes). */
export interface Segment {
  s: number;
  e: number;
  t: string;
}

const YT_ID = /^[\w-]{11}$/;

/** Identifiant d'une vidéo YouTube (watch, youtu.be, shorts, embed, live), sinon null. */
export function youTubeId(url: URL): string | null {
  const host = url.hostname.replace(/^(www|m|music)\./, "").toLowerCase();
  let id: string | null = null;
  if (host === "youtu.be") id = url.pathname.split("/")[1] ?? null;
  else if (host === "youtube.com" || host === "youtube-nocookie.com") {
    if (url.pathname === "/watch") id = url.searchParams.get("v");
    else {
      const m = /^\/(?:shorts|embed|live|v)\/([\w-]{11})/.exec(url.pathname);
      id = m?.[1] ?? null;
    }
  }
  return id && YT_ID.test(id) ? id : null;
}

export function youTubeUrl(id: string): string {
  return `https://www.youtube.com/watch?v=${id}`;
}

/** 83 → « 1:23 », 3725 → « 1:02:05 ». */
export function formatTime(seconds: number): string {
  const t = Math.max(0, Math.floor(seconds));
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = String(t % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${s}` : `${m}:${s}`;
}

interface Json3 {
  events?: {
    tStartMs?: number;
    dDurationMs?: number;
    segs?: { utf8?: string }[];
  }[];
}

/** Sous-titres YouTube au format json3 → répliques (sans doublons ni lignes vides). */
export function parseJson3(data: Json3): Segment[] {
  const out: Segment[] = [];
  for (const ev of data.events ?? []) {
    if (!ev.segs || ev.tStartMs === undefined) continue;
    const t = ev.segs
      .map((s) => s.utf8 ?? "")
      .join("")
      .replace(/\s+/g, " ")
      .trim();
    if (!t) continue;
    const s = ev.tStartMs / 1000;
    const e = (ev.tStartMs + (ev.dDurationMs ?? 0)) / 1000;
    const prev = out[out.length - 1];
    if (prev && prev.t === t) {
      prev.e = Math.max(prev.e, e);
      continue;
    }
    out.push({ s, e: Math.max(e, s), t });
  }
  return out;
}

/** Texte d'une vidéo : une réplique par ligne (les positions des répliques servent à retrouver le moment d'un mot). */
export function segmentsText(segments: Segment[]): string {
  return segments.map((s) => s.t).join("\n");
}

/** Position de début de chaque réplique dans `segmentsText(segments)`. */
export function segmentOffsets(segments: Segment[]): number[] {
  const offsets: number[] = [];
  let o = 0;
  for (const s of segments) {
    offsets.push(o);
    o += s.t.length + 1;
  }
  return offsets;
}

/** Index de la réplique qui contient la position `index` du texte (recherche dichotomique). */
export function segmentAt(offsets: number[], index: number): number {
  let lo = 0;
  let hi = offsets.length - 1;
  if (hi < 0 || index < 0) return -1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (offsets[mid] <= index) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

/** Réplique en cours à l'instant `time` (la dernière commencée), -1 avant la première. */
export function activeSegment(segments: { s: number }[], time: number): number {
  let lo = 0;
  let hi = segments.length - 1;
  if (hi < 0 || time < segments[0].s) return -1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (segments[mid].s <= time) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

/** Morceau d'une réplique : texte simple, ou mot cliquable (`[mot]`). */
export type SegmentPart = string | [string];

/** Découpe chaque réplique en morceaux à partir des mots repérés dans le texte complet. */
export function segmentParts(segments: Segment[], tokens: { word: string; index: number }[]): SegmentPart[][] {
  const offsets = segmentOffsets(segments);
  const out: SegmentPart[][] = segments.map(() => []);
  const cursor = segments.map(() => 0);
  for (const tok of [...tokens].sort((a, b) => a.index - b.index)) {
    const i = segmentAt(offsets, tok.index);
    if (i < 0) continue;
    const rel = tok.index - offsets[i];
    const text = segments[i].t;
    if (rel < cursor[i] || rel + tok.word.length > text.length) continue;
    if (rel > cursor[i]) out[i].push(text.slice(cursor[i], rel));
    out[i].push([tok.word]);
    cursor[i] = rel + tok.word.length;
  }
  segments.forEach((seg, i) => {
    if (cursor[i] < seg.t.length) out[i].push(seg.t.slice(cursor[i]));
  });
  return out;
}
