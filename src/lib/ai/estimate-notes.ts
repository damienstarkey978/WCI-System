/**
 * Prep field notes before they hit the estimate drafter.
 *
 * Financing / budget-range chatter belongs on the lead (CRM context) but must not
 * drive line-item pricing — feeding it into the structured-output call both wastes
 * tokens and tempts the model to invent "budget" lines. Scope text stays; the rest
 * is returned so callers can surface it as an assumption without pricing from it.
 */

/** Patterns that mark a sentence/line as non-scope (financing, budget range, payment). */
const NON_SCOPE_PATTERNS: readonly RegExp[] = [
  /\bHELOC\b/i,
  /\bhome\s+equity\b/i,
  /\bfinanc(e|ing|ed)\b/i,
  /\bloan\b/i,
  /\bmortgage\b/i,
  /\bcredit\s+line\b/i,
  /\bdown\s+payment\b/i,
  /\bpayment\s+plan\b/i,
  /\bbudget\s+(range|of|is|around|about|~|approx)/i,
  /\bbudget[:\s]+\$?\d/i,
  /\bclient\s+budget\b/i,
  /\bprice\s+range\b/i,
  /\bcash\s+vs\.?\s+financ/i,
  /\binterest\s+rate\b/i,
  /\bAPR\b/,
];

export interface StrippedEstimateNotes {
  /** Notes safe to feed the estimate drafter (scope / quantities / materials). */
  readonly scopeNotes: string;
  /** Snippets removed from the drafter input; keep on the lead, not in pricing. */
  readonly removedSnippets: readonly string[];
}

function isNonScopeText(text: string): boolean {
  return NON_SCOPE_PATTERNS.some((pattern) => pattern.test(text));
}

/**
 * Split notes into scope (for the drafter) vs financing/budget snippets (kept aside).
 * Splits on newlines and sentence boundaries so a mixed paragraph can keep its
 * scope sentences while dropping the financing ones.
 */
export function stripNonScopeTextFromNotes(notes: string): StrippedEstimateNotes {
  const trimmed = notes.trim();
  if (!trimmed) {
    return { scopeNotes: "", removedSnippets: [] };
  }

  const blocks = trimmed.split(/\n+/);
  const scopeParts: string[] = [];
  const removed: string[] = [];

  for (const block of blocks) {
    const sentences = splitSentences(block);
    if (sentences.length <= 1) {
      const piece = block.trim();
      if (!piece) continue;
      if (isNonScopeText(piece)) removed.push(piece);
      else scopeParts.push(piece);
      continue;
    }

    const kept: string[] = [];
    for (const sentence of sentences) {
      const piece = sentence.trim();
      if (!piece) continue;
      if (isNonScopeText(piece)) removed.push(piece);
      else kept.push(piece);
    }
    if (kept.length > 0) scopeParts.push(kept.join(" "));
  }

  return {
    scopeNotes: scopeParts.join("\n\n").trim(),
    removedSnippets: removed,
  };
}

/** Light sentence split — enough for field notes, not a full NLP tokenizer. */
function splitSentences(block: string): string[] {
  const parts = block.match(/[^.!?]+[.!?]+|[^.!?]+$/g);
  return parts?.map((part) => part.trim()).filter(Boolean) ?? [block];
}
