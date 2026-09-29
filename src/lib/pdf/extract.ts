import "server-only";
import { extractTextItems, getDocumentProxy, getMeta } from "unpdf";
import { normalizeExtractedText } from "@/lib/chinese/normalize";

export interface ExtractedPage {
  pageNumber: number;
  text: string;
  charCount: number;
  /** Page quasiment sans texte : probablement une image (scan, capture). */
  likelyImage: boolean;
}

export interface PdfExtraction {
  pageCount: number;
  pages: ExtractedPage[];
  fullText: string;
  pdfCreatedAt: Date | null;
  title: string | null;
  imagePages: number[];
}

export class PdfExtractionError extends Error {
  constructor(
    message: string,
    public readonly code: "INVALID_PDF" | "ENCRYPTED" | "EMPTY" | "UNKNOWN",
  ) {
    super(message);
    this.name = "PdfExtractionError";
  }
}

/** Seuil sous lequel une page est considérée comme une image (caractères non blancs). */
const IMAGE_PAGE_THRESHOLD = 20;

interface Item {
  str: string;
  x: number;
  y: number;
  width: number;
  fontSize: number;
}

/**
 * Reconstitue les lignes d'une page à partir des positions des fragments.
 * Les écarts horizontaux importants (colonnes de tableau) deviennent des tabulations.
 */
export function itemsToLines(items: Item[]): string[] {
  const usable = items.filter((i) => i.str.trim().length > 0);
  if (usable.length === 0) return [];
  // Tri de haut en bas (y décroissant en coordonnées PDF), puis gauche → droite.
  const sorted = [...usable].sort((a, b) => b.y - a.y || a.x - b.x);
  const lines: Item[][] = [];
  for (const it of sorted) {
    const tol = Math.max(2, (it.fontSize || 10) * 0.45);
    const line = lines.find((l) => Math.abs(l[0].y - it.y) <= tol);
    if (line) line.push(it);
    else lines.push([it]);
  }
  lines.sort((a, b) => b[0].y - a[0].y);
  return lines.map((line) => {
    line.sort((a, b) => a.x - b.x);
    let out = "";
    let prevEnd: number | null = null;
    let prevSize = 10;
    for (const it of line) {
      if (prevEnd !== null) {
        const gap = it.x - prevEnd;
        const size = Math.max(prevSize, it.fontSize || 10);
        if (gap > size * 1.8) out += "\t";
        else if (gap > size * 0.25 && !out.endsWith(" ") && !it.str.startsWith(" ")) out += " ";
      }
      out += it.str;
      prevEnd = it.x + (it.width || it.str.length * (it.fontSize || 10) * 0.5);
      prevSize = it.fontSize || 10;
    }
    return normalizeExtractedText(out).replace(/[ \u00a0]+/g, " ").trim();
  });
}

function parsePdfDate(raw: unknown): Date | null {
  if (raw instanceof Date && !isNaN(raw.getTime())) return raw;
  if (typeof raw !== "string") return null;
  // Format PDF : D:YYYYMMDDHHmmSS+HH'mm'
  const m = raw.match(/D?:?(\d{4})(\d{2})?(\d{2})?(\d{2})?(\d{2})?(\d{2})?/);
  if (!m) return null;
  const [, y, mo = "01", d = "01", h = "00", mi = "00", s = "00"] = m;
  const date = new Date(`${y}-${mo}-${d}T${h}:${mi}:${s}Z`);
  return isNaN(date.getTime()) ? null : date;
}

/** Vérifie la signature d'un fichier PDF. */
export function isPdfBuffer(buf: Uint8Array): boolean {
  if (buf.length < 5) return false;
  const head = Buffer.from(buf.subarray(0, 1024)).toString("latin1");
  return head.includes("%PDF-");
}

export async function extractPdf(data: Uint8Array): Promise<PdfExtraction> {
  if (!isPdfBuffer(data)) {
    throw new PdfExtractionError("Ce fichier n'est pas un PDF valide.", "INVALID_PDF");
  }
  let doc;
  try {
    // unpdf/pdf.js peut détacher le buffer : on travaille sur une copie.
    doc = await getDocumentProxy(new Uint8Array(data));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/password|encrypt/i.test(msg)) {
      throw new PdfExtractionError("Ce PDF est protégé par un mot de passe.", "ENCRYPTED");
    }
    throw new PdfExtractionError(
      "Le PDF est illisible ou corrompu. Essaie de le réexporter.",
      "INVALID_PDF",
    );
  }

  try {
    const { totalPages, items } = await extractTextItems(doc);
    const pages: ExtractedPage[] = items.map((pageItems, idx) => {
      const lines = itemsToLines(pageItems);
      const text = lines.join("\n");
      const charCount = text.replace(/\s/g, "").length;
      return {
        pageNumber: idx + 1,
        text,
        charCount,
        likelyImage: charCount < IMAGE_PAGE_THRESHOLD,
      };
    });

    let pdfCreatedAt: Date | null = null;
    let title: string | null = null;
    try {
      const meta = await getMeta(doc);
      pdfCreatedAt = parsePdfDate(meta.info?.CreationDate);
      title = typeof meta.info?.Title === "string" && meta.info.Title.trim() ? meta.info.Title.trim() : null;
    } catch {
      // Métadonnées facultatives.
    }

    const fullText = pages.map((p) => `--- Page ${p.pageNumber} ---\n${p.text}`).join("\n\n");
    return {
      pageCount: totalPages,
      pages,
      fullText,
      pdfCreatedAt,
      title,
      imagePages: pages.filter((p) => p.likelyImage).map((p) => p.pageNumber),
    };
  } catch (err) {
    if (err instanceof PdfExtractionError) throw err;
    throw new PdfExtractionError(
      "Impossible de lire le texte de ce PDF.",
      "UNKNOWN",
    );
  } finally {
    await Promise.resolve(doc.cleanup?.()).catch(() => undefined);
  }
}
