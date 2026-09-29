import { z } from "zod";

/**
 * Convertit un schéma Zod en JSON Schema (forme « entrée », les transformations
 * Zod étant appliquées ensuite lors de la validation locale).
 */
export function toJsonSchema(schema: z.ZodTypeAny): Record<string, unknown> {
  const js = z.toJSONSchema(schema, { io: "input", unrepresentable: "any" }) as Record<string, unknown>;
  delete js.$schema;
  return js;
}

/** Extrait le premier objet JSON d'un texte (tolère les blocs ```json). */
export function extractJsonObject(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced ? fenced[1] : text;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end <= start) throw new Error("Aucun objet JSON trouvé");
  return JSON.parse(candidate.slice(start, end + 1));
}
