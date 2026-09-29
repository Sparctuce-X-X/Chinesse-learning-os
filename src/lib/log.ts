/**
 * Journalisation minimale des erreurs techniques.
 * Ne journalise jamais de secret : seules les propriétés explicitement passées sont écrites.
 */
export function logError(scope: string, err: unknown, meta: Record<string, unknown> = {}) {
  if (process.env.NODE_ENV === "test" && !process.env.DEBUG_LOGS) return;
  const message = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
  console.error(`[${new Date().toISOString()}] [${scope}] ${message}`, Object.keys(meta).length ? meta : "");
}
