/**
 * Scope traceability for AI estimate lines (Handoff parity CR P1 #14).
 * Every AI line stores the source sentence from raw lead/field notes;
 * missing source → "NOT IN NOTES".
 */

export const NOT_IN_NOTES = "NOT IN NOTES";

export function normalizeSourceNote(raw: string | null | undefined): string {
  const trimmed = raw?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : NOT_IN_NOTES;
}

/**
 * Best-effort: find a sentence in `notes` that overlaps the line title/description.
 * Falls back to NOT IN NOTES (never invent a paraphrase).
 */
export function resolveSourceNoteFromNotes(params: {
  readonly notes: string | null | undefined;
  readonly title: string;
  readonly description?: string | null;
  readonly modelSourceNote?: string | null;
}): string {
  const model = params.modelSourceNote?.trim();
  if (model) {
    const notes = params.notes?.trim() ?? "";
    if (!notes) return normalizeSourceNote(model);
    // Only keep the model citation if it actually appears in the raw notes.
    if (notes.toLowerCase().includes(model.toLowerCase())) return model;
  }

  const notes = params.notes?.trim();
  if (!notes) return NOT_IN_NOTES;

  const haystack = notes.toLowerCase();
  const needles = [params.title, params.description ?? ""]
    .flatMap((text) => text.split(/[^a-zA-Z0-9]+/))
    .map((token) => token.toLowerCase())
    .filter((token) => token.length >= 4);

  const sentences = notes
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter(Boolean);

  for (const sentence of sentences) {
    const lower = sentence.toLowerCase();
    if (needles.some((token) => lower.includes(token) && haystack.includes(token))) {
      return sentence;
    }
  }

  return NOT_IN_NOTES;
}
