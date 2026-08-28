/**
 * The confirm-gate itself. A tool with a client-facing or money-moving effect
 * never runs from inside Jarvis's tool loop (src/lib/jarvis/tools.ts) — it only
 * calls createPendingAction, which just writes a row. The only code path that
 * performs the underlying action is confirmPendingAction below, which is only ever
 * invoked from a Server Action a human triggers by clicking Confirm in the chat UI
 * (src/app/jarvis/actions.ts). Jarvis has no way to call confirmPendingAction itself.
 */

import { Prisma } from "@/generated/prisma/client";
import { BidPackageStatus, BillApprovalStatus, JarvisActionStatus, UserRole } from "@/generated/prisma/enums";
import {
  acceptBidSubmission,
  AlreadyInvitedError,
  BidPackageNotFoundError,
  BidPackageNotOpenError,
  BidSubmissionAlreadyDecidedError,
  BidSubmissionNotAcceptedError,
  BidSubmissionNotFoundError,
  BidSubmissionNotSubmittedError,
  closeBidPackage,
  declineBidSubmission,
  inviteVendorToBid,
  MissingCostCodeError,
  NoAcceptedSubmissionsError,
  pushBidSubmissionToPurchaseOrder,
  VendorNotFoundError,
} from "@/lib/bids/service";
import {
  BillNotFoundError,
  IllegalBillTransitionError,
  updateBillStatus,
} from "@/lib/bills/service";
import { ClientNotFoundError, issuePortalLoginInvite as issueClientPortalInvite } from "@/lib/client-portal/auth";
import { db } from "@/lib/db";
import { formatMoney } from "@/lib/format";
import { InvoiceNotFoundError, InvoiceNotSendableError, sendInvoice } from "@/lib/invoicing/service";
import { ProposalNotDraftError, ProposalNotFoundError, sendProposal } from "@/lib/proposals/service";
import {
  approveSelectionOption,
  JobNotOpenError,
  SelectionAlreadyDecidedError,
  SelectionNotFoundError,
  SelectionOptionNotFoundError,
} from "@/lib/selections/service";
import {
  DuplicateStaffEmailError,
  inviteStaffMember,
  LastAdminError,
  setStaffActive,
  StaffMemberNotFoundError,
  updateStaffRole,
} from "@/lib/staff/service";
import { issuePortalLoginInvite as issueVendorPortalInvite, VendorNotFoundError as VendorPortalVendorNotFoundError } from "@/lib/vendor-portal/auth";

export class PendingActionNotFoundError extends Error {
  constructor(actionId: string) {
    super(`Pending action ${actionId} not found`);
    this.name = "PendingActionNotFoundError";
  }
}

export class PendingActionNotPendingError extends Error {
  constructor(actionId: string, status: string) {
    super(`Pending action ${actionId} is already ${status}.`);
    this.name = "PendingActionNotPendingError";
  }
}

export class UnknownPendingActionToolError extends Error {
  constructor(toolName: string) {
    super(`Jarvis doesn't know how to execute pending action tool "${toolName}".`);
    this.name = "UnknownPendingActionToolError";
  }
}

export interface CreatePendingActionInput {
  readonly conversationId: string;
  readonly toolName: string;
  readonly input: Record<string, unknown>;
  readonly summary: string;
}

export async function createPendingAction(input: CreatePendingActionInput) {
  return db.jarvisPendingAction.create({
    data: {
      conversationId: input.conversationId,
      toolName: input.toolName,
      input: input.input as Prisma.InputJsonValue,
      summary: input.summary,
    },
  });
}

export async function listPendingActions(conversationId: string) {
  return db.jarvisPendingAction.findMany({ where: { conversationId }, orderBy: { createdAt: "asc" } });
}

async function findPendingActionForOrg(organizationId: string, actionId: string) {
  const action = await db.jarvisPendingAction.findFirst({
    where: { id: actionId, conversation: { organizationId } },
  });
  if (!action) throw new PendingActionNotFoundError(actionId);
  if (action.status !== JarvisActionStatus.PENDING) throw new PendingActionNotPendingError(actionId, action.status);
  return action;
}

/**
 * Actually perform a queued action's underlying effect, via the exact same service
 * function a human clicking the real "Send" button in that feature would call — this
 * is not a parallel code path with its own logic, just a dispatch table.
 */
const STAFF_MANAGEMENT_TOOLS = new Set(["invite_staff_member", "update_staff_role", "deactivate_staff_member", "reactivate_staff_member"]);

async function executePendingAction(organizationId: string, toolName: string, input: unknown, actorRole: UserRole): Promise<string> {
  // Defense in depth: tools.ts already refuses to queue a staff-management action for a
  // non-admin, but the person clicking Confirm is re-checked here too, at the moment the
  // real effect happens — never trust a decision made earlier in the flow for something
  // this sensitive.
  if (STAFF_MANAGEMENT_TOOLS.has(toolName) && actorRole !== UserRole.ADMIN) {
    return "Only an admin can confirm this — it was not completed.";
  }

  switch (toolName) {
    case "send_invoice": {
      const { invoiceId } = input as { invoiceId: string };
      const { invoice, alreadySent } = await sendInvoice(organizationId, invoiceId);
      return alreadySent
        ? `Invoice ${invoice.invoiceNumber} was already sent.`
        : `Sent invoice ${invoice.invoiceNumber} (${formatMoney(invoice.amountCents)}).`;
    }
    case "send_proposal": {
      const { proposalId } = input as { proposalId: string };
      const proposal = await sendProposal(organizationId, proposalId);
      return `Sent proposal "${proposal.title}" to the client.`;
    }
    case "approve_selection_option": {
      const { selectionId, optionId } = input as { selectionId: string; optionId: string };
      await approveSelectionOption({ organizationId, selectionId, optionId });
      return "Approved the selection and posted the price difference to the budget.";
    }
    case "advance_bill_status": {
      const { billId, targetStatus } = input as { billId: string; targetStatus: BillApprovalStatus };
      const result = await updateBillStatus(organizationId, billId, targetStatus);
      if (result.unchanged) return `The bill was already ${targetStatus}.`;
      const totalCents = result.lineItems.reduce((total, item) => total + item.amountCents, 0);
      return `Moved the bill (${formatMoney(totalCents)}) to ${targetStatus}.`;
    }
    case "invite_vendor_to_bid": {
      const { bidPackageId, vendorId } = input as { bidPackageId: string; vendorId: string };
      await inviteVendorToBid(organizationId, bidPackageId, vendorId);
      return "Invited the vendor to bid on the package.";
    }
    case "accept_bid_submission": {
      const { bidSubmissionId } = input as { bidSubmissionId: string };
      await acceptBidSubmission(organizationId, bidSubmissionId);
      return "Accepted the bid submission.";
    }
    case "decline_bid_submission": {
      const { bidSubmissionId } = input as { bidSubmissionId: string };
      await declineBidSubmission(organizationId, bidSubmissionId);
      return "Declined the bid submission.";
    }
    case "award_bid_package": {
      const { bidPackageId } = input as { bidPackageId: string };
      await closeBidPackage({ organizationId, bidPackageId, status: BidPackageStatus.AWARDED });
      return "Awarded and closed the bid package.";
    }
    case "push_bid_submission_to_purchase_order": {
      const { bidSubmissionId, poNumber, fallbackCostCodeId } = input as {
        bidSubmissionId: string;
        poNumber: string;
        fallbackCostCodeId?: string;
      };
      const po = await pushBidSubmissionToPurchaseOrder(organizationId, bidSubmissionId, poNumber, fallbackCostCodeId);
      return `Created purchase order ${po.poNumber} from the accepted bid.`;
    }
    case "invite_client_to_portal": {
      const { clientId } = input as { clientId: string };
      await issueClientPortalInvite(organizationId, clientId);
      return "Invited the client to the portal.";
    }
    case "invite_vendor_to_portal": {
      const { vendorId } = input as { vendorId: string };
      await issueVendorPortalInvite(organizationId, vendorId);
      return "Invited the vendor to the portal.";
    }
    case "invite_staff_member": {
      const { email, name, role } = input as { email: string; name: string | null; role: UserRole };
      const staff = await inviteStaffMember({ organizationId, email, name, role });
      return `Pre-authorized ${staff.email} as ${staff.role}. They'll get access as soon as they sign in with that email — no invitation email was sent, since WCI OS doesn't send email yet.`;
    }
    case "update_staff_role": {
      const { userId, role } = input as { userId: string; role: UserRole };
      const staff = await updateStaffRole(organizationId, userId, role);
      return `Changed ${staff.email}'s role to ${staff.role}.`;
    }
    case "deactivate_staff_member": {
      const { userId } = input as { userId: string };
      const staff = await setStaffActive(organizationId, userId, false);
      return `Deactivated ${staff.email}. They can no longer sign in.`;
    }
    case "reactivate_staff_member": {
      const { userId } = input as { userId: string };
      const staff = await setStaffActive(organizationId, userId, true);
      return `Reactivated ${staff.email}.`;
    }
    default:
      throw new UnknownPendingActionToolError(toolName);
  }
}

export async function confirmPendingAction(organizationId: string, actionId: string, actorRole: UserRole) {
  const action = await findPendingActionForOrg(organizationId, actionId);

  let resultSummary: string;
  try {
    resultSummary = await executePendingAction(organizationId, action.toolName, action.input, actorRole);
  } catch (error) {
    if (
      error instanceof InvoiceNotFoundError ||
      error instanceof InvoiceNotSendableError ||
      error instanceof ProposalNotFoundError ||
      error instanceof ProposalNotDraftError ||
      error instanceof SelectionNotFoundError ||
      error instanceof SelectionOptionNotFoundError ||
      error instanceof SelectionAlreadyDecidedError ||
      error instanceof JobNotOpenError ||
      error instanceof BillNotFoundError ||
      error instanceof IllegalBillTransitionError ||
      error instanceof BidPackageNotFoundError ||
      error instanceof BidPackageNotOpenError ||
      error instanceof VendorNotFoundError ||
      error instanceof AlreadyInvitedError ||
      error instanceof BidSubmissionNotFoundError ||
      error instanceof BidSubmissionAlreadyDecidedError ||
      error instanceof BidSubmissionNotSubmittedError ||
      error instanceof NoAcceptedSubmissionsError ||
      error instanceof MissingCostCodeError ||
      error instanceof BidSubmissionNotAcceptedError ||
      error instanceof ClientNotFoundError ||
      error instanceof VendorPortalVendorNotFoundError ||
      error instanceof DuplicateStaffEmailError ||
      error instanceof StaffMemberNotFoundError ||
      error instanceof LastAdminError
    ) {
      resultSummary = `Couldn't complete this: ${error.message}`;
    } else {
      throw error;
    }
  }

  return db.jarvisPendingAction.update({
    where: { id: action.id },
    data: { status: JarvisActionStatus.CONFIRMED, resultSummary, resolvedAt: new Date() },
  });
}

export async function declinePendingAction(organizationId: string, actionId: string) {
  const action = await findPendingActionForOrg(organizationId, actionId);

  return db.jarvisPendingAction.update({
    where: { id: action.id },
    data: { status: JarvisActionStatus.DECLINED, resultSummary: "Declined by the user.", resolvedAt: new Date() },
  });
}
