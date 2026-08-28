/**
 * The confirm-gate itself. A tool with a client-facing or money-moving effect
 * never runs from inside Jarvis's tool loop (src/lib/jarvis/tools.ts) — it only
 * calls createPendingAction, which just writes a row. The only code path that
 * performs the underlying action is confirmPendingAction below, which is only ever
 * invoked from a Server Action a human triggers by clicking Confirm in the chat UI
 * (src/app/jarvis/actions.ts). Jarvis has no way to call confirmPendingAction itself.
 */

import { Prisma } from "@/generated/prisma/client";
import { JarvisActionStatus } from "@/generated/prisma/enums";
import { db } from "@/lib/db";
import { formatMoney } from "@/lib/format";
import { InvoiceNotFoundError, InvoiceNotSendableError, sendInvoice } from "@/lib/invoicing/service";
import { ProposalNotDraftError, ProposalNotFoundError, sendProposal } from "@/lib/proposals/service";

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
async function executePendingAction(organizationId: string, toolName: string, input: unknown): Promise<string> {
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
    default:
      throw new UnknownPendingActionToolError(toolName);
  }
}

export async function confirmPendingAction(organizationId: string, actionId: string) {
  const action = await findPendingActionForOrg(organizationId, actionId);

  let resultSummary: string;
  try {
    resultSummary = await executePendingAction(organizationId, action.toolName, action.input);
  } catch (error) {
    if (
      error instanceof InvoiceNotFoundError ||
      error instanceof InvoiceNotSendableError ||
      error instanceof ProposalNotFoundError ||
      error instanceof ProposalNotDraftError
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
