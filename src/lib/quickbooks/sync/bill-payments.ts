/**
 * WCI → QBO BillPayment (Money rule 7): when an OS bill that was pushed to QBO is
 * marked PAID, record the payment in QuickBooks so Bill.com does not keep it unpaid.
 *
 * Independent of QBO_BILL_PUSH_ENABLED (that gate is for Bill *creates* only).
 * Soft-fails into QboSyncLog — never rolls back the WCI PAID status.
 */

import { db } from "@/lib/db";
import { isQuickBooksConfigured } from "@/lib/env";
import { accountingRequest, QuickBooksNotConfiguredError } from "@/lib/quickbooks/client";
import { getValidAccessToken, QuickBooksNotConnectedError } from "@/lib/quickbooks/connection-service";
import { recordSyncAttempt } from "@/lib/quickbooks/sync-log";

import { findBankAccountId } from "./accounts";

interface QboRef {
  readonly Id: string;
}

export class BillPaymentSkippedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BillPaymentSkippedError";
  }
}

function txnDateIso(paidOn: Date | null | undefined, paidAt: Date | null | undefined): string {
  const source = paidOn ?? paidAt ?? new Date();
  return source.toISOString().slice(0, 10);
}

/**
 * Create a QBO BillPayment against the bill's qboBillId. Idempotent when
 * Bill.qboBillPaymentId is already set. Returns the QBO BillPayment id.
 */
export async function recordBillPaymentInQuickBooks(
  organizationId: string,
  billId: string,
  options: { readonly actorLabel?: string | null } = {},
): Promise<string | null> {
  const bill = await db.bill.findFirst({
    where: { id: billId, organizationId },
    include: { lineItems: { select: { amountCents: true } }, vendor: true },
  });
  if (!bill) return null;
  if (!bill.qboBillId) {
    throw new BillPaymentSkippedError("Bill has no qboBillId — nothing to pay in QuickBooks.");
  }
  if (bill.qboBillPaymentId) return bill.qboBillPaymentId;
  if (!bill.vendorId || !bill.vendor?.qboVendorId) {
    throw new BillPaymentSkippedError("Bill has no linked QBO vendor — cannot record BillPayment.");
  }

  const totalCents = bill.lineItems.reduce((sum, line) => sum + line.amountCents, 0);
  if (totalCents <= 0) {
    throw new BillPaymentSkippedError("Bill total is not positive — refusing BillPayment.");
  }

  if (!isQuickBooksConfigured()) throw new QuickBooksNotConfiguredError();

  try {
    const access = await getValidAccessToken(organizationId);
    const bankAccountId = await findBankAccountId(access);
    const amount = totalCents / 100;

    const created = await accountingRequest<{ BillPayment: QboRef }>({
      ...access,
      method: "POST",
      path: "billpayment",
      body: {
        VendorRef: { value: bill.vendor.qboVendorId },
        TotalAmt: amount,
        PayType: "Check",
        TxnDate: txnDateIso(bill.paidOn, bill.paidAt),
        PrivateNote: bill.paidMethod?.trim() ? `WCI: ${bill.paidMethod.trim()}` : "Recorded from WCI OS",
        CheckPayment: { BankAccountRef: { value: bankAccountId } },
        Line: [
          {
            Amount: amount,
            LinkedTxn: [{ TxnId: bill.qboBillId, TxnType: "Bill" }],
          },
        ],
      },
    });

    await db.bill.update({
      where: { id: bill.id },
      data: { qboBillPaymentId: created.BillPayment.Id },
    });
    await recordSyncAttempt({
      organizationId,
      entityType: "BILL",
      direction: "TO_QBO",
      wciRecordId: bill.id,
      qboId: created.BillPayment.Id,
      vendorName: bill.vendorName,
      docNumber: bill.billNumber,
      amountCents: totalCents,
      actorLabel: options.actorLabel ?? null,
      operation: "bill_payment",
    });
    return created.BillPayment.Id;
  } catch (error) {
    if (error instanceof QuickBooksNotConnectedError || error instanceof QuickBooksNotConfiguredError) {
      await recordSyncAttempt({
        organizationId,
        entityType: "BILL",
        direction: "TO_QBO",
        wciRecordId: bill.id,
        error,
        vendorName: bill.vendorName,
        docNumber: bill.billNumber,
        amountCents: totalCents,
        actorLabel: options.actorLabel ?? null,
        operation: "bill_payment",
      });
      throw error;
    }
    await recordSyncAttempt({
      organizationId,
      entityType: "BILL",
      direction: "TO_QBO",
      wciRecordId: bill.id,
      error,
      vendorName: bill.vendorName,
      docNumber: bill.billNumber,
      amountCents: totalCents,
      actorLabel: options.actorLabel ?? null,
      operation: "bill_payment",
    });
    throw error;
  }
}

/** Best-effort wrapper used from updateBillStatus — never throws to the caller. */
export async function tryRecordBillPaymentInQuickBooks(
  organizationId: string,
  billId: string,
  options: { readonly actorLabel?: string | null } = {},
): Promise<void> {
  try {
    await recordBillPaymentInQuickBooks(organizationId, billId, options);
  } catch {
    // Logged inside recordBillPaymentInQuickBooks when it got that far.
  }
}
