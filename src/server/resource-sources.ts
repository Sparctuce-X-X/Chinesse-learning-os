import "server-only";
import { countHanzi } from "@/lib/chinese/text";
import { extractPdf, isPdfBuffer, PdfExtractionError } from "@/lib/pdf/extract";
import type { Segment } from "@/lib/resources/video";

/**
 * Récupération du texte d'une ressource externe : texte collé, page web (article),
 * document (PDF, Word, texte, sous-titres SRT/VTT). Le texte est converti en chinois simplifié.
 */

export class ResourceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ResourceError";
  }
}

export const RESOURCE_MAX_CHARS = 30_000;
export const RESOURCE_MIN_HANZI = 20;
export const RESOURCE_MAX_BYTES = 20 * 1024 * 1024;

export interface SourceText {
  text: string;
  title: string | null;
  siteName: string | null;
  convertedFromTraditional: boolean;
  truncated: boolean;
}

const REFERENCE_LINE = /原始内容存档于|存档副本|访问日期|取用日期|檢索日期|ISBN[\s:：]*[\dX-]{10,}|\bdoi:|^\^/i;

const g = globalThis as unknown as { __resT2s?: Promise<(s: string) => string> };
function t2s(): Promise<(s: string) => string> {
  if (!g.__resT2s) g.__resT2s = import("opencc-js/t2cn").then((m) => m.Converter({ from: "t", to: "cn" }));
  return g.__resT2s;
}

/** Conversion en chinois simplifié (titres…). */
export async function toSimplified(text: string): Promise<string> {
  return (await t2s())(text);
}

/** Nettoie le texte, le convertit en simplifié et vérifie qu'il contient bien du chinois. */
export async function normalizeResourceText(raw: string, meta: { title?: string | null; siteName?: string | null } = {}): Promise<SourceText> {
  let text = raw
    .normalize("NFC")
    .replace(/\r\n?/g, "\n")
    // Renvois de notes (Wikipédia, articles) : [1], [12]…
    .replace(/\[\d{1,3}\]/g, "")
    .replace(/[\t 　]+/g, " ")
    .replace(/[ ]{2,}/g, " ")
    .split("\n")
    .map((l) => l.trim())
    // Lignes de références bibliographiques (Wikipédia, articles) : du bruit pour l'apprentissage.
    .filter((l) => !REFERENCE_LINE.test(l))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (countHanzi(text) < RESOURCE_MIN_HANZI) {
    throw new ResourceError("Ce contenu ne contient presque pas de chinois (moins de 20 caractères). Vérifie la source ou colle le texte directement.");
  }
  const convert = await t2s();
  const simplified = convert(text);
  const converted = simplified !== text;
  text = simplified;
  const truncated = text.length > RESOURCE_MAX_CHARS;
  if (truncated) text = text.slice(0, RESOURCE_MAX_CHARS);
  const title = meta.title ? convert(meta.title.trim()).slice(0, 200) : null;
  return { text, title: title || null, siteName: meta.siteName?.trim().slice(0, 100) || null, convertedFromTraditional: converted, truncated };
}

/** Annotations de sous-titres sans paroles : [音乐], [Music], (笑声)… */
const CAPTION_NOISE = /[\[［(（【][^\]］)）】]{0,12}[\]］)）】]/g;

/**
 * Répliques d'une vidéo : nettoyage, conversion en simplifié et limite de longueur, en gardant
 * l'horodatage de chaque réplique.
 */
export async function normalizeSegments(raw: Segment[]): Promise<{ segments: Segment[]; convertedFromTraditional: boolean; truncated: boolean }> {
  const convert = await t2s();
  let converted = false;
  let total = 0;
  let truncated = false;
  const segments: Segment[] = [];
  for (const seg of raw) {
    const cleaned = seg.t.normalize("NFC").replace(CAPTION_NOISE, " ").replace(/[\s　]+/g, " ").trim();
    if (!cleaned || countHanzi(cleaned) === 0) continue;
    const t = convert(cleaned);
    if (t !== cleaned) converted = true;
    if (total + t.length + 1 > RESOURCE_MAX_CHARS) {
      truncated = true;
      break;
    }
    total += t.length + 1;
    segments.push({ s: Math.round(seg.s * 100) / 100, e: Math.round(seg.e * 100) / 100, t });
  }
  if (segments.reduce((n, s) => n + countHanzi(s.t), 0) < RESOURCE_MIN_HANZI) {
    throw new ResourceError("Les sous-titres de cette vidéo ne contiennent presque pas de chinois.");
  }
  return { segments, convertedFromTraditional: converted, truncated };
}

// ─── Page web ─────────────────────────────────────────────────────────────────

export function parseHttpUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new ResourceError("Ce lien n'est pas valide. Copie l'adresse complète (https://…).");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new ResourceError("Seuls les liens http et https sont acceptés.");
  return url;
}

/** Vidéo non YouTube (Bilibili…) : pas encore prise en charge. */
export function isVideoUrl(url: URL): boolean {
  return /(^|\.)(youtube\.com|youtu\.be|bilibili\.com|b23\.tv)$/i.test(url.hostname);
}

async function readLimited(res: Response, maxBytes: number): Promise<Uint8Array> {
  const reader = res.body?.getReader();
  if (!reader) return new Uint8Array(await res.arrayBuffer());
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) {
      await reader.cancel();
      throw new ResourceError("La page est trop volumineuse.");
    }
    chunks.push(value);
  }
  const out = new Uint8Array(size);
  let o = 0;
  for (const c of chunks) {
    out.set(c, o);
    o += c.byteLength;
  }
  return out;
}

function decodeHtml(bytes: Uint8Array, contentType: string): string {
  const fromHeader = /charset=([\w-]+)/i.exec(contentType)?.[1];
  const head = new TextDecoder("latin1").decode(bytes.slice(0, 4096));
  const fromMeta = /<meta[^>]+charset=["']?([\w-]+)/i.exec(head)?.[1];
  const charset = (fromHeader || fromMeta || "utf-8").toLowerCase();
  try {
    return new TextDecoder(charset === "gb2312" ? "gbk" : charset).decode(bytes);
  } catch {
    return new TextDecoder("utf-8").decode(bytes);
  }
}

/** Extrait le texte principal d'une page HTML (algorithme Readability de Firefox). */
export async function extractArticle(html: string, url: string): Promise<{ text: string; title: string | null; siteName: string | null }> {
  const [{ parseHTML }, { Readability }] = await Promise.all([import("linkedom"), import("@mozilla/readability")]);
  const { document } = parseHTML(html);
  const pageTitle = document.querySelector("title")?.textContent?.trim() ?? null;
  let text = "";
  let title: string | null = pageTitle;
  let siteName: string | null = null;
  try {
    const article = new Readability(document as unknown as Document, { charThreshold: 100 }).parse();
    if (article?.textContent) {
      text = article.textContent;
      title = article.title?.trim() || pageTitle;
      siteName = article.siteName?.trim() || null;
    }
  } catch {
    // page atypique : repli sur les paragraphes
  }
  if (countHanzi(text) < RESOURCE_MIN_HANZI) {
    const { document: fresh } = parseHTML(html);
    text = [...fresh.querySelectorAll("h1, h2, h3, p, li")].map((n) => n.textContent?.trim() ?? "").filter(Boolean).join("\n");
  }
  // Readability renvoie des blocs sans sauts de ligne entre paragraphes : on les rétablit.
  text = text.replace(/([。！？])\s*/g, "$1\n");
  return { text, title, siteName: siteName ?? new URL(url).hostname.replace(/^www\./, "") };
}

export async function fetchArticle(rawUrl: string): Promise<SourceText> {
  const url = parseHttpUrl(rawUrl);
  if (isVideoUrl(url)) {
    throw new ResourceError(
      "Seules les vidéos YouTube sont prises en charge pour l'instant (onglet « Vidéo »). Pour une autre plateforme, télécharge les sous-titres (.srt ou .vtt) et importe-les comme fichier, ou colle la transcription.",
    );
  }
  let res: Response;
  try {
    res = await fetch(url, {
      redirect: "follow",
      signal: AbortSignal.timeout(20_000),
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36",
        "Accept-Language": "zh-CN,zh;q=0.9,fr;q=0.8",
        Accept: "text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.5",
      },
    });
  } catch (err) {
    const timeout = err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError");
    throw new ResourceError(timeout ? "La page met trop de temps à répondre." : "Impossible d'ouvrir ce lien (site injoignable ou hors ligne).");
  }
  if (!res.ok) {
    throw new ResourceError(
      res.status === 403 || res.status === 401
        ? `Le site refuse l'accès automatique (erreur ${res.status}). Copie-colle le texte de l'article à la place.`
        : `Le site a répondu avec une erreur (${res.status}).`,
    );
  }
  const type = res.headers.get("content-type") ?? "";
  const bytes = await readLimited(res, 5 * 1024 * 1024);
  if (/application\/pdf/i.test(type) || isPdfBuffer(bytes)) {
    const doc = await extractDocument(url.pathname.split("/").pop() || "document.pdf", bytes);
    return doc;
  }
  if (!/html|text\/plain|xml/i.test(type) && type) throw new ResourceError("Ce lien ne mène pas à une page web lisible.");
  const html = decodeHtml(bytes, type);
  const article = /text\/plain/i.test(type) ? { text: html, title: null, siteName: url.hostname } : await extractArticle(html, url.toString());
  try {
    return await normalizeResourceText(article.text, article);
  } catch (err) {
    if (err instanceof ResourceError) {
      throw new ResourceError(
        "Aucun texte chinois trouvé sur cette page (elle est peut-être chargée par JavaScript ou réservée aux abonnés). Copie-colle le texte à la place.",
      );
    }
    throw err;
  }
}

// ─── Documents ────────────────────────────────────────────────────────────────

/** Sous-titres SRT / VTT : ne garde que les répliques (sans numéros, horodatages ni balises). */
export function subtitlesToText(raw: string): string {
  const lines = raw.replace(/\r\n?/g, "\n").split("\n");
  const out: string[] = [];
  for (const line of lines) {
    const l = line.trim();
    if (!l || l === "WEBVTT" || /^\d+$/.test(l) || /-->/.test(l) || /^(NOTE|STYLE|REGION|Kind:|Language:)/.test(l)) continue;
    const clean = l.replace(/<[^>]+>/g, "").replace(/\{\\[^}]*\}/g, "").trim();
    if (clean && out[out.length - 1] !== clean) out.push(clean);
  }
  return out.join("\n");
}

export const DOCUMENT_EXTENSIONS = [".pdf", ".docx", ".txt", ".md", ".srt", ".vtt"];

export async function extractDocument(filename: string, data: Uint8Array): Promise<SourceText> {
  if (data.byteLength === 0) throw new ResourceError("Le fichier est vide.");
  if (data.byteLength > RESOURCE_MAX_BYTES) throw new ResourceError("Le fichier dépasse 20 Mo.");
  const ext = (/\.[a-z0-9]+$/i.exec(filename)?.[0] ?? "").toLowerCase();
  const baseTitle = filename.replace(/\.[a-z0-9]+$/i, "").replace(/[_-]+/g, " ").trim() || null;
  let text: string;
  if (ext === ".pdf" || isPdfBuffer(data)) {
    try {
      text = (await extractPdf(data)).fullText;
    } catch (err) {
      throw new ResourceError(err instanceof PdfExtractionError ? err.message : "Impossible de lire ce PDF.");
    }
    if (countHanzi(text) < RESOURCE_MIN_HANZI) {
      throw new ResourceError("Ce PDF ne contient pas de texte chinois lisible (c'est peut-être un scan). Pour un scan, importe-le plutôt comme cours.");
    }
  } else if (ext === ".docx") {
    const mammoth = await import("mammoth");
    try {
      text = (await mammoth.extractRawText({ buffer: Buffer.from(data) })).value;
    } catch {
      throw new ResourceError("Impossible de lire ce document Word (.docx).");
    }
  } else if (ext === ".srt" || ext === ".vtt") {
    text = subtitlesToText(new TextDecoder("utf-8").decode(data));
  } else if (ext === ".txt" || ext === ".md" || ext === "") {
    text = new TextDecoder("utf-8").decode(data);
  } else {
    throw new ResourceError(`Format non pris en charge (${ext}). Formats acceptés : PDF, Word (.docx), texte (.txt, .md), sous-titres (.srt, .vtt).`);
  }
  return normalizeResourceText(text, { title: baseTitle });
}
