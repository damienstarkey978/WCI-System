/**
 * WCI → QBO bill delete (Money rule 8): when WCI voids or deletes a bill that was
 * pushed, remove the QBO Bill so Bill.com does not keep an orphan payable.
 *
 * Independent of QBO_BILL_PUSH_ENABLED. Soft-fails into QboSyncLog.
 */

import { db } from "@/lib/db";
import { isQuickBooksConfigured } from "@/lib/env";
import { accountingRequest, QuickBooksNotConfiguredError } from "@/lib/quickbooks/client";
import { getValidAccessToken, QuickBooksNotConnectedError } from "@/lib/quickbooks/connection-service";
import { recordSyncAttempt } from "@/lib/quickbooks/sync-log";

interface QboRef {
  readonly Id: string;
  readonly SyncToken: string;
}

/**
 * Delete the QBO Bill linked to this WCI bill (if any). Clears qboBillId on success.
 * No-op when the bill was never pushed.
 */
export async function deleteLinkedQuickBooksBill(
  organizationId: string,
  billId: string,
  options: { readonly actorLabel?: string | null; readonly operation?: "void" | "delete" } = {},
): Promise<void> {
  const bill = await db.bill.findFirst({
    where: { id: billId, organizationId },
    include: { lineItems: { select: { amountCents: true } } },
  });
  if (!bill?.qboBillId) return;
  if (!isQuickBooksConfigured()) throw new QuickBooksNotConfiguredError();

  const totalCents = bill.lineItems.reduce((sum, line) => sum + line.amountCents, 0);
  const operation = options.operation ?? "void";

  try {
    const access = await getValidAccessToken(organizationId);
    const existing = await accountingRequest<{ Bill: QboRef }>({
      ...access,
      method: "GET",
      path: `bill/${bill.qboBillId}`,
    });

    // Intuit Accounting API: POST bill?operation=delete with Id + SyncToken.
    await accountingRequest({
      ...access,
      method: "POST",
      path: "bill",
      query: { operation: "delete" },
      body: { Id: bill.qboBillId, SyncToken: existing.Bill.SyncToken },
    });

    await db.bill.update({
      where: { id: bill.id },
      data: { qboBillId: null, qboSyncToken: null, qboBillPaymentId: null },
    });
    await recordSyncAttempt({
      organizationId,
      entityType: "BILL",
      direction: "TO_QBO",
      wciRecordId: bill.id,
      qboId: bill.qboBillId,
      vendorName: bill.vendorName,
      docNumber: bill.billNumber,
      amountCents: totalCents,
      actorLabel: options.actorLabel ?? null,
      operation,
    });
  } catch (error) {
    if (error instanceof QuickBooksNotConnectedError || error instanceof QuickBooksNotConfiguredError) {
      await recordSyncAttempt({
        organizationId,
        entityType: "BILL",
        direction: "TO_QBO",
        wciRecordId: bill.id,
        qboId: bill.qboBillId,
        error,
        vendorName: bill.vendorName,
        docNumber: bill.billNumber,
        amountCents: totalCents,
        actorLabel: options.actorLabel ?? null,
        operation,
      });
      throw error;
    }
    await recordSyncAttempt({
      organizationId,
      entityType: "BILL",
      direction: "TO_QBO",
      wciRecordId: bill.id,
      qboId: bill.qboBillId,
      error,
      vendorName: bill.vendorName,
      docNumber: bill.billNumber,
      amountCents: totalCents,
      actorLabel: options.actorLabel ?? null,
      operation,
    });
    throw error;
  }
}

export async function tryDeleteLinkedQuickBooksBill(
  organizationId: string,
  billId: string,
  options: { readonly actorLabel?: string | null; readonly operation?: "void" | "delete" } = {},
): Promise<void> {
  try {
    await deleteLinkedQuickBooksBill(organizationId, billId, options);
  } catch {
    // Logged inside deleteLinkedQuickBooksBill.
  }
}
