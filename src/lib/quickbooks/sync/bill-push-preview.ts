/**
 * Dry-run for QBO bill push (Money rule 4): list what would be created, count,
 * and dollar total — never POSTs while dryRun=true. Bulk > handful requires
 * QBO_BILL_BULK_PUSH_APPROVED=true even for a live push batch helper.
 */

import { BillApprovalStatus } from "@/generated/prisma/enums";
import { db } from "@/lib/db";
import { isQuickBooksBillBulkPushApproved } from "@/lib/env";
import {
  syncBillToQuickBooksDetailed,
  type SyncBillToQuickBooksResult,
} from "@/lib/quickbooks/sync/bills";

/** Max bills in one live batch without explicit bulk approval. */
export const QBO_BILL_PUSH_HANDFUL_LIMIT = 5;

export { isQuickBooksBillBulkPushApproved };

export interface BillPushPreviewRow {
  readonly billId: string;
  readonly billNumber: string | null;
  readonly vendorName: string;
  readonly approvalStatus: string;
  readonly totalCents: number;
  readonly outcome: SyncBillToQuickBooksResult["action"] | "skipped" | "refused";
  readonly qboBillId?: string;
  readonly message?: string;
}

export interface BillPushPreviewResult {
  readonly dryRun: true;
  readonly wouldCreateCount: number;
  readonly wouldCreateCents: number;
  readonly wouldUpdateCount: number;
  readonly wouldLinkCount: number;
  readonly refusedCount: number;
  readonly rows: readonly BillPushPreviewRow[];
}

export class BillQuickBooksBulkTooLargeError extends Error {
  constructor(count: number) {
    super(
      `Refusing to push ${count} bills in one batch (limit ${QBO_BILL_PUSH_HANDFUL_LIMIT} without QBO_BILL_BULK_PUSH_APPROVED=true). Run a dry-run first and get Damien's explicit approval.`,
    );
    this.name = "BillQuickBooksBulkTooLargeError";
  }
}

/**
 * Preview push for the given bill ids (or all READY_FOR_PAYMENT + send=true in org when empty).
 * Always dry-run — never creates QBO bills.
 */
export async function previewBillQuickBooksPush(
  organizationId: string,
  billIds?: readonly string[],
): Promise<BillPushPreviewResult> {
  const bills =
    billIds && billIds.length > 0
      ? await db.bill.findMany({
          where: { organizationId, id: { in: [...billIds] } },
          include: { lineItems: { select: { amountCents: true } } },
        })
      : await db.bill.findMany({
          where: {
            organizationId,
            approvalStatus: BillApprovalStatus.READY_FOR_PAYMENT,
            sendToQuickBooks: true,
          },
          include: { lineItems: { select: { amountCents: true } } },
          take: 500,
        });

  const rows: BillPushPreviewRow[] = [];
  let wouldCreateCount = 0;
  let wouldCreateCents = 0;
  let wouldUpdateCount = 0;
  let wouldLinkCount = 0;
  let refusedCount = 0;

  for (const bill of bills) {
    const totalCents = bill.lineItems.reduce((sum, line) => sum + line.amountCents, 0);
    try {
      const result = await syncBillToQuickBooksDetailed(organizationId, bill.id, { dryRun: true });
      if (result.action === "dry_run_would_create") {
        wouldCreateCount += 1;
        wouldCreateCents += totalCents;
      } else if (result.action === "dry_run_would_update" || result.action === "updated") {
        wouldUpdateCount += 1;
      } else if (result.action === "linked") {
        wouldLinkCount += 1;
      }
      rows.push({
        billId: bill.id,
        billNumber: bill.billNumber,
        vendorName: bill.vendorName,
        approvalStatus: bill.approvalStatus,
        totalCents,
        outcome: result.action,
        qboBillId: result.qboBillId === "dry-run" ? undefined : result.qboBillId,
        message: result.duplicateReason,
      });
    } catch (error) {
      refusedCount += 1;
      rows.push({
        billId: bill.id,
        billNumber: bill.billNumber,
        vendorName: bill.vendorName,
        approvalStatus: bill.approvalStatus,
        totalCents,
        outcome: "refused",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return {
    dryRun: true,
    wouldCreateCount,
    wouldCreateCents,
    wouldUpdateCount,
    wouldLinkCount,
    refusedCount,
    rows,
  };
}

/** Assert a live multi-bill push stays within the handful limit unless approved. */
export function assertBillPushBatchSizeAllowed(count: number): void {
  if (count <= QBO_BILL_PUSH_HANDFUL_LIMIT) return;
  if (isQuickBooksBillBulkPushApproved()) return;
  throw new BillQuickBooksBulkTooLargeError(count);
}
