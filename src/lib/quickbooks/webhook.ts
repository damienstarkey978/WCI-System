/**
 * QBO -> WCI: inbound Invoice Payment and Bill Payment sync (CLAUDE.md 2.3, "Invoice
 * Payments ... QBO -> WCI" and "Bill Payments ... QBO -> WCI"). Intuit's webhook
 * payload only ever carries entity type + id + realmId ("something changed, go
 * look") — never the entity itself — so processing one event means fetching the real
 * Payment/BillPayment object from the Accounting API before doing anything. Mirrors
 * src/app/api/v1/webhooks/stripe/route.ts's shape (verify signature -> resolve org ->
 * recordPayment), with QuickBooksConnection.realmId standing in for Stripe's metadata
 * as the way to find the right organization.
 *
 * Docs: https://developer.intuit.com/app/developer/qbo/docs/develop/webhooks
 */

import { createHmac, timingSafeEqual } from "node:crypto";

import { BillApprovalStatus, PaymentMethod } from "@/generated/prisma/enums";
import { BillNotFoundError, IllegalBillTransitionError, updateBillStatus } from "@/lib/bills/service";
import { db } from "@/lib/db";
import { quickBooksWebhookVerifierToken } from "@/lib/env";
import { InvoiceNotFoundError, InvoiceVoidedError, recordPayment } from "@/lib/invoicing/service";
import { OverpaymentError } from "@/lib/invoicing/calc";

import { accountingRequest } from "./client";
import { getValidAccessToken } from "./connection-service";
import { recordSyncAttempt } from "./sync-log";

export class InvalidQuickBooksWebhookSignatureError extends Error {
  constructor() {
    super("Invalid QuickBooks webhook signature.");
    this.name = "InvalidQuickBooksWebhookSignatureError";
  }
}

export class QuickBooksWebhooksNotConfiguredError extends Error {
  constructor() {
    super("QBO_WEBHOOK_VERIFIER_TOKEN is not set — cannot verify inbound QuickBooks webhooks.");
    this.name = "QuickBooksWebhooksNotConfiguredError";
  }
}

/**
 * Intuit signs the raw body with HMAC-SHA256 keyed by the app's Webhooks verifier
 * token, base64-encoded, sent as the `intuit-signature` header. Same
 * HMAC-and-timingSafeEqual shape as verifyStripeWebhookSignature, applied to base64
 * instead of Stripe's hex.
 */
export function verifyQuickBooksWebhookSignature(rawBody: string, signatureHeader: string | null): void {
  const verifierToken = quickBooksWebhookVerifierToken();
  if (!verifierToken) throw new QuickBooksWebhooksNotConfiguredError();
  if (!signatureHeader) throw new InvalidQuickBooksWebhookSignatureError();

  const expected = createHmac("sha256", verifierToken).update(rawBody, "utf8").digest("base64");
  const expectedBuffer = Buffer.from(expected, "base64");
  const actualBuffer = Buffer.from(signatureHeader, "base64");
  if (expectedBuffer.length !== actualBuffer.length || !timingSafeEqual(expectedBuffer, actualBuffer)) {
    throw new InvalidQuickBooksWebhookSignatureError();
  }
}

interface QboWebhookPayload {
  readonly eventNotifications: ReadonlyArray<{
    readonly realmId: string;
    readonly dataChangeEvent: {
      readonly entities: ReadonlyArray<{ readonly name: string; readonly id: string; readonly operation: string }>;
    };
  }>;
}

interface QboPaymentLine {
  readonly Amount: number;
  readonly LinkedTxn?: ReadonlyArray<{ readonly TxnId: string; readonly TxnType: string }>;
}

interface QboPayment {
  readonly Id: string;
  readonly TxnDate?: string;
  readonly Line?: readonly QboPaymentLine[];
}

/** Entry point for the webhook route: process every entity in every notification, best-effort per entity. */
export async function processQuickBooksWebhookPayload(rawBody: string): Promise<void> {
  const payload = JSON.parse(rawBody) as QboWebhookPayload;

  for (const notification of payload.eventNotifications ?? []) {
    const connection = await db.quickBooksConnection.findFirst({ where: { realmId: notification.realmId, disconnectedAt: null } });
    if (!connection) continue; // Unknown/disconnected realm — nothing to apply this to.

    for (const entity of notification.dataChangeEvent.entities) {
      if (entity.operation === "Delete") continue;
      if (entity.name === "Payment") {
        await applyInboundPayment(connection.organizationId, entity.id);
      } else if (entity.name === "BillPayment") {
        await applyInboundBillPayment(connection.organizationId, entity.id);
      }
    }
  }
}

async function applyInboundPayment(organizationId: string, qboPaymentId: string): Promise<void> {
  try {
    const access = await getValidAccessToken(organizationId);
    const { Payment: payment } = await accountingRequest<{ Payment: QboPayment }>({
      ...access,
      method: "GET",
      path: `payment/${qboPaymentId}`,
    });

    for (const line of payment.Line ?? []) {
      const invoiceLink = line.LinkedTxn?.find((txn) => txn.TxnType === "Invoice");
      if (!invoiceLink) continue;

      const invoice = await db.invoice.findFirst({ where: { organizationId, qboInvoiceId: invoiceLink.TxnId } });
      if (!invoice) continue; // This QBO invoice wasn't one we pushed — nothing to reconcile it against.

      // Idempotency: Intuit's webhooks are at-least-once delivery, and QBO_SYNC payments
      // are keyed by QBO payment id in `reference` — a redelivered event is a no-op.
      const alreadyRecorded = await db.payment.findFirst({ where: { invoiceId: invoice.id, reference: payment.Id } });
      if (alreadyRecorded) continue;

      try {
        await recordPayment({
          organizationId,
          invoiceId: invoice.id,
          method: PaymentMethod.QBO_SYNC,
          amountCents: Math.round(line.Amount * 100),
          reference: payment.Id,
          receivedAt: payment.TxnDate ? new Date(payment.TxnDate) : undefined,
        });
      } catch (error) {
        // Redelivery races or a since-voided invoice — none of these resolve on retry.
        if (!(error instanceof InvoiceNotFoundError || error instanceof InvoiceVoidedError || error instanceof OverpaymentError)) {
          throw error;
        }
      }

      await recordSyncAttempt({ organizationId, entityType: "INVOICE", direction: "FROM_QBO", wciRecordId: invoice.id, qboId: payment.Id });
    }
  } catch (error) {
    await recordSyncAttempt({ organizationId, entityType: "INVOICE", direction: "FROM_QBO", wciRecordId: qboPaymentId, error });
  }
}

interface QboBillPayment {
  readonly Id: string;
  readonly Line?: readonly QboPaymentLine[];
}

/**
 * A bill paid in QBO before WCI's own approval workflow reached READY_FOR_PAYMENT
 * can't be silently fast-forwarded to PAID — that workflow exists to gate money
 * movement (see the transition table in src/lib/bills/service.ts), and skipping it
 * would hide that nobody in WCI ever approved the bill. Recorded as a FAILED sync
 * attempt instead: visible and retryable (CLAUDE.md 2.3), not lost, once someone
 * catches the bill up in WCI or approves the discrepancy.
 */
async function applyInboundBillPayment(organizationId: string, qboBillPaymentId: string): Promise<void> {
  try {
    const access = await getValidAccessToken(organizationId);
    const { BillPayment: billPayment } = await accountingRequest<{ BillPayment: QboBillPayment }>({
      ...access,
      method: "GET",
      path: `billpayment/${qboBillPaymentId}`,
    });

    for (const line of billPayment.Line ?? []) {
      const billLink = line.LinkedTxn?.find((txn) => txn.TxnType === "Bill");
      if (!billLink) continue;

      const bill = await db.bill.findFirst({ where: { organizationId, qboBillId: billLink.TxnId } });
      if (!bill) continue; // This QBO bill wasn't one we pushed — nothing to reconcile it against.

      try {
        await updateBillStatus(organizationId, bill.id, BillApprovalStatus.PAID);
        await recordSyncAttempt({ organizationId, entityType: "BILL", direction: "FROM_QBO", wciRecordId: bill.id, qboId: billPayment.Id });
      } catch (error) {
        if (error instanceof BillNotFoundError) continue; // Raced with a delete — nothing left to mark.
        if (error instanceof IllegalBillTransitionError) {
          await recordSyncAttempt({ organizationId, entityType: "BILL", direction: "FROM_QBO", wciRecordId: bill.id, error });
          continue;
        }
        throw error;
      }
    }
  } catch (error) {
    await recordSyncAttempt({ organizationId, entityType: "BILL", direction: "FROM_QBO", wciRecordId: qboBillPaymentId, error });
  }
}
