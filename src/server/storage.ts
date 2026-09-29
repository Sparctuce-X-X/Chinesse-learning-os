import "server-only";
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { isAbsolute, join, resolve } from "node:path";

/** Dossier des fichiers de l'application (copies des PDF, audio). Jamais source-materials/. */
export function dataDir(): string {
  const dir = process.env.DATA_DIR || "./data";
  // Dossier de données choisi à l'exécution : exclu du traçage de fichiers du build.
  return isAbsolute(dir) ? dir : resolve(/*turbopackIgnore: true*/ process.cwd(), dir);
}

export function absoluteStoragePath(relative: string): string {
  return join(dataDir(), relative);
}

export function sha256(buf: Uint8Array): string {
  return createHash("sha256").update(buf).digest("hex");
}

/** Enregistre une copie interne ; renvoie le chemin relatif à DATA_DIR. */
export async function saveFile(subdir: "uploads" | "audio", name: string, data: Uint8Array): Promise<string> {
  const dir = join(dataDir(), subdir);
  await mkdir(dir, { recursive: true });
  const relative = join(subdir, name);
  await writeFile(join(dataDir(), relative), data);
  return relative;
}
