/**
 * Pure schema for the AI weekly client-update digest (Phase 8). No network calls, no
 * database — mirrors the estimate-draft.ts / bill-ocr-draft.ts split.
 *
 * There is no money-unit conversion here (unlike the other two AI drafters) because
 * this schema's output is never money — see weekly-summary-service.ts for why no
 * budget/cost figure is ever fed into or asked of this prompt in the first place.
 */

import { z } from "zod";

export const weeklySummaryDraftSchema = z.object({
  headline: z.string().trim().min(1).max(120).describe("A short, upbeat one-line summary of the week, e.g. 'Framing wrapped up, drywall starts Monday'"),
  body: z
    .string()
    .trim()
    .min(1)
    .max(2_000)
    .describe("2-4 short paragraphs in plain, friendly language a homeowner (not a contractor) can follow"),
  highlights: z
    .array(z.string().trim().max(200))
    .min(1)
    .max(6)
    .describe("3-6 short bullet points of what happened this week, each standalone and specific"),
});

export type WeeklySummaryDraft = z.infer<typeof weeklySummaryDraftSchema>;
