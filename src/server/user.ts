import "server-only";
import { prisma } from "@/lib/db/prisma";

/** Identifiant fixe : plusieurs requêtes simultanées ne peuvent pas créer plusieurs utilisateurs. */
const DEFAULT_USER_ID = "default-user";

/** Application personnelle : un utilisateur unique, créé à la première utilisation. */
export async function getUser() {
  const existing = await prisma.user.findFirst({ orderBy: { createdAt: "asc" } });
  if (existing) return existing;
  try {
    return await prisma.user.upsert({ where: { id: DEFAULT_USER_ID }, create: { id: DEFAULT_USER_ID, name: "Moi" }, update: {} });
  } catch {
    // Création concurrente : l'autre requête a gagné, on relit.
    return prisma.user.findFirstOrThrow({ orderBy: { createdAt: "asc" } });
  }
}

export async function getUserId(): Promise<string> {
  return (await getUser()).id;
}
