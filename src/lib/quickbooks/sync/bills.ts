/**
 * WCI Bill -> QBO Bill (CLAUDE.md 2.3, "Bills ... WCI -> QBO"). Linked by
 * Bill.qboBillId once synced. Each line references a per-cost-code Item
 * (../sync/cost-codes.ts), so Bills break out by cost code in QBO the way Buildertrend
 * exports never did. Each line also carries the job as a CustomerRef when the job has
 * a client to sync as its sub-customer parent (../sync/jobs.ts) — that's job-costing
 * tagging, not a requirement, so a job without a client yet still syncs its bills fine,
 * just without that tag.
 *
 * Requires a linked Vendor (Bill.vendorId): QBO Bills need a real VendorRef, and a
 * free-text vendorName with no Vendor record has nothing to sync as one. Bills entered
 * against an unlinked vendor name stay QuickBooks-only until a Vendor record exists.
 */

import { db } from "@/lib/db";
import { accountingRequest } from "@/lib/quickbooks/client";
import { getValidAccessToken, type ValidQuickBooksAccess } from "@/lib/quickbooks/connection-service";
import { recordSyncAttempt } from "@/lib/quickbooks/sync-log";

import { ensureCostCodeItemId } from "./cost-codes";
import { JobHasNoClientError, syncJobToQuickBooks } from "./jobs";
import { syncVendorToQuickBooks } from "./vendors";

export class BillNotFoundError extends Error {
  constructor(billId: string) {
    super(`Bill ${billId} not found.`);
    this.name = "BillNotFoundError";
  }
}

export class BillHasNoVendorError extends Error {
  constructor(billId: string) {
    super(`Bill ${billId} has no linked Vendor record — QuickBooks needs a real vendor to bill against, not just a vendor name.`);
    this.name = "BillHasNoVendorError";
  }
}

interface QboRef {
  readonly Id: string;
  readonly SyncToken: string;
}

/** Resolves the job's sub-customer id for job-costing tags, or undefined if the job has no client to sync as its parent yet. */
async function optionalJobCustomerRef(organizationId: string, job: { readonly id: string; readonly qboCustomerId: string | null }): Promise<string | undefined> {
  if (job.qboCustomerId) return job.qboCustomerId;
  try {
    return await syncJobToQuickBooks(organizationId, job.id);
  } catch (error) {
    if (error instanceof JobHasNoClientError) return undefined;
    throw error;
  }
}

/** Push one Bill to QuickBooks, creating or updating as needed. Returns the QBO Bill id. */
export async function syncBillToQuickBooks(organizationId: string, billId: string): Promise<string> {
  const bill = await db.bill.findFirst({
    where: { id: billId, organizationId },
    include: { lineItems: { include: { costCode: true }, orderBy: { sortOrder: "asc" } }, job: true, vendor: true },
  });
  if (!bill) throw new BillNotFoundError(billId);
  if (!bill.vendorId || !bill.vendor) throw new BillHasNoVendorError(billId);

  try {
    const vendorQboId = bill.vendor.qboVendorId ?? (await syncVendorToQuickBooks(organizationId, bill.vendor.id));
    const jobCustomerId = await optionalJobCustomerRef(organizationId, bill.job);
    const access = await getValidAccessToken(organizationId);

    const lines = await Promise.all(
      bill.lineItems.map(async (line) => {
        const itemId = await ensureCostCodeItemId(access, organizationId, line.costCodeId);
        return {
          Amount: line.amountCents / 100,
          DetailType: "ItemBasedExpenseLineDetail" as const,
          Description: line.title,
          ItemBasedExpenseLineDetail: {
            ItemRef: { value: itemId },
            ...(jobCustomerId ? { CustomerRef: { value: jobCustomerId } } : {}),
          },
        };
      }),
    );

    const billFields = {
      VendorRef: { value: vendorQboId },
      Line: lines,
      ...(bill.billNumber ? { DocNumber: bill.billNumber } : {}),
      ...(bill.issuedOn ? { TxnDate: bill.issuedOn.toISOString().slice(0, 10) } : {}),
      ...(bill.dueOn ? { DueDate: bill.dueOn.toISOString().slice(0, 10) } : {}),
    };

    const qboBill = bill.qboBillId
      ? await accountingRequest<{ Bill: QboRef }>({
          ...access,
          method: "POST",
          path: "bill",
          body: { Id: bill.qboBillId, SyncToken: await currentSyncToken(access, bill.qboBillId), sparse: true, ...billFields },
        })
      : await accountingRequest<{ Bill: QboRef }>({ ...access, method: "POST", path: "bill", body: billFields });

    await db.bill.update({ where: { id: bill.id }, data: { qboBillId: qboBill.Bill.Id, qboSyncToken: qboBill.Bill.SyncToken } });
    await recordSyncAttempt({ organizationId, entityType: "BILL", direction: "TO_QBO", wciRecordId: bill.id, qboId: qboBill.Bill.Id });
    return qboBill.Bill.Id;
  } catch (error) {
    await recordSyncAttempt({ organizationId, entityType: "BILL", direction: "TO_QBO", wciRecordId: bill.id, error });
    throw error;
  }
}

/** QBO's SyncToken drifts if the bill was touched in QBO directly — refetch it right before an update rather than trust our cached copy. */
async function currentSyncToken(access: ValidQuickBooksAccess, qboBillId: string): Promise<string> {
  const existing = await accountingRequest<{ Bill: QboRef }>({ ...access, method: "GET", path: `bill/${qboBillId}` });
  return existing.Bill.SyncToken;
}
