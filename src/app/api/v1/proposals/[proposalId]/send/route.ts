/** /api/v1/proposals/[proposalId]/send — mark a proposal SENT. */

import { apiError, withApiAuth } from "@/lib/api-auth";
import {
  IncompletePreparedForError,
  IncompleteProposalTermsError,
  PaymentScheduleIncompleteError,
  ProposalNotDraftError,
  ProposalNotFoundError,
  RoofSendBlockedError,
  sendProposal,
  SignatureRequiredError,
} from "@/lib/proposals/service";
import { BannedCoverMessageError } from "@/lib/proposals/cover-message";
import {
  emailProposalToClient,
  ProposalClientContactMissingError,
  textProposalToClient,
} from "@/lib/proposals/deliver";
import { EmailNotConfiguredError, EmailSendError } from "@/lib/email/send";
import { SmsNotConfiguredError, SmsSendError } from "@/lib/sms/send";

type Context = { params: Promise<{ proposalId: string }> };

/**
 * Mark SENT. Optional body `{ channel: "email" | "sms" }` also delivers the
 * approval link (CR P2 #24) — same paths as the staff UI.
 */
export const POST = withApiAuth<Context>(["proposals:write"], async (request, auth, context) => {
  const { proposalId } = await context.params;

  let channel: "email" | "sms" | undefined;
  try {
    const body = await request.json();
    if (body && typeof body === "object" && "channel" in body) {
      const value = (body as { channel?: unknown }).channel;
      if (value === "email" || value === "sms") channel = value;
      else if (value != null) {
        return apiError(422, "validation_failed", 'channel must be "email" or "sms" when provided.');
      }
    }
  } catch {
    // Empty body is fine — status-only send.
  }

  try {
    if (channel === "email") {
      const delivery = await emailProposalToClient({
        organizationId: auth.organizationId,
        proposalId,
      });
      return Response.json({ data: delivery });
    }
    if (channel === "sms") {
      const delivery = await textProposalToClient({
        organizationId: auth.organizationId,
        proposalId,
      });
      return Response.json({ data: delivery });
    }

    const proposal = await sendProposal(auth.organizationId, proposalId);
    return Response.json({ data: proposal });
  } catch (error) {
    if (error instanceof ProposalNotFoundError) return apiError(404, "not_found", error.message);
    if (error instanceof ProposalNotDraftError) return apiError(409, "not_draft", error.message);
    if (error instanceof SignatureRequiredError) {
      return apiError(422, "signature_required", error.message);
    }
    if (error instanceof IncompleteProposalTermsError) {
      return apiError(422, "incomplete_terms", error.message, { reasons: error.reasons });
    }
    if (error instanceof PaymentScheduleIncompleteError) {
      return apiError(422, "incomplete_payment_schedule", error.message, { reasons: error.reasons });
    }
    if (error instanceof BannedCoverMessageError) {
      return apiError(422, "banned_cover_message", error.message);
    }
    if (error instanceof IncompletePreparedForError) {
      return apiError(422, "incomplete_prepared_for", error.message, { reasons: error.reasons });
    }
    if (error instanceof RoofSendBlockedError) {
      return apiError(422, "roof_send_blocked", error.message, { reasons: error.reasons });
    }
    if (error instanceof ProposalClientContactMissingError) {
      return apiError(422, "client_contact_missing", error.message);
    }
    if (error instanceof EmailNotConfiguredError || error instanceof SmsNotConfiguredError) {
      return apiError(503, "delivery_not_configured", error.message);
    }
    if (error instanceof EmailSendError || error instanceof SmsSendError) {
      return apiError(502, "delivery_failed", error.message);
    }
    throw error;
  }
});
