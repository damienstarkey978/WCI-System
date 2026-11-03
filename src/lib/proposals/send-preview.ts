/**
 * Pre-send proposal preview validation (Handoff parity CR P2 #25).
 * Aggregates blocking checks from P1 #6–10 + P2 #21.
 */

import { findCoverMessageIssues } from "@/lib/proposals/cover-message";
import { findPaymentScheduleIssues, type ScheduleDraw } from "@/lib/proposals/payment-schedule";
import { findPreparedForIssues } from "@/lib/proposals/prepared-for";
import { findProposalTermsIssues } from "@/lib/proposals/terms-guard";

export interface ProposalSendPreviewInput {
  readonly title?: string | null;
  readonly coverMessage?: string | null;
  readonly termsText?: string | null;
  readonly requireSignature: boolean;
  readonly draws: readonly ScheduleDraw[];
  readonly preparedFor: {
    readonly name?: string | null;
    readonly email?: string | null;
    readonly phone?: string | null;
  };
}

export interface ProposalSendPreviewIssue {
  readonly code: string;
  readonly message: string;
}

export interface ProposalSendPreviewResult {
  readonly ready: boolean;
  readonly issues: readonly ProposalSendPreviewIssue[];
}

export function previewProposalSend(input: ProposalSendPreviewInput): ProposalSendPreviewResult {
  const issues: ProposalSendPreviewIssue[] = [];

  if (!input.title?.trim()) {
    issues.push({ code: "title_required", message: "Proposal title is required." });
  }

  for (const message of findProposalTermsIssues(input.termsText)) {
    issues.push({ code: "incomplete_terms", message });
  }
  for (const message of findPaymentScheduleIssues(input.draws)) {
    issues.push({ code: "incomplete_payment_schedule", message });
  }
  if (!input.requireSignature) {
    issues.push({
      code: "signature_required",
      message: "Require-signature is off — turn it on (or have an admin disable intentionally) before send.",
    });
  }
  for (const message of findCoverMessageIssues(input.coverMessage)) {
    issues.push({ code: "cover_message", message });
  }
  for (const message of findPreparedForIssues(input.preparedFor)) {
    issues.push({ code: "prepared_for", message });
  }

  return { ready: issues.length === 0, issues };
}
