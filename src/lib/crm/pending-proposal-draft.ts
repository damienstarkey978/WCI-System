/**
 * Shape of Estimate.pendingProposalDraft — the AI client narrative held on an
 * estimate until an explicit Create Proposal conversion (Handoff-style
 * estimate-first flow). Validated before write and before convert.
 */

import { z } from "zod";

const sectionSchema = z.object({
  title: z.string().min(1).max(200),
  bullets: z.array(z.string().min(1).max(2000)).min(1).max(40),
});

export const pendingProposalDraftSchema = z.object({
  coverMessage: z.string().max(8000).nullable().optional(),
  sections: z.array(sectionSchema).min(1).max(40),
});

export type PendingProposalDraft = z.infer<typeof pendingProposalDraftSchema>;

export function parsePendingProposalDraft(value: unknown): PendingProposalDraft | null {
  const parsed = pendingProposalDraftSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}
