/** Niveaux HSK (sans la liste de mots : utilisable côté client). */
export const HSK_LEVELS = [0, 1, 2, 3, 4, 5, 6, 7] as const;

export function hskLevelLabel(level: number): string {
  if (level <= 0) return "Débutant";
  if (level >= 7) return "HSK 7-9";
  return `HSK ${level}`;
}
