/**
 * WCI Bill -> QBO Bill (CLAUDE.md 2.3, "Bills ... WCI -> QBO"). Linked by
 * Bill.qboBillId once synced.
 *
 * Money rules 2026-11-02 (Rules 1–6): pause default off; never push PAID/VOID/
 * paidAt; never invent JOB_* numbers; duplicate-check before create; require
 * READY_FOR_PAYMENT + explicit sendToQuickBooks=true; blank invoice # holds.
 */

import { BillApprovalStatus } from "@/generated/prisma/enums";
import { vendorInvoiceNumberPushBlockReason } from "@/lib/bills/bill-number";
import {
  isBillQuickBooksPushUnsafeByStatus,
  isBillQuickBooksSyncBlocked,
} from "@/lib/bills/quickbooks-intent";
import { db } from "@/lib/db";
import { isQuickBooksBillPushEnabled } from "@/lib/env";
import { accountingRequest } from "@/lib/quickbooks/client";
import { getValidAccessToken, type ValidQuickBooksAccess } from "@/lib/quickbooks/connection-service";
import { recordSyncAttempt } from "@/lib/quickbooks/sync-log";

import { findOsBillDuplicate, findQboBillByDocNumber } from "./bill-duplicates";
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

/** Staff/agent explicitly skipped QuickBooks at READY_FOR_PAYMENT — do not create a QBO Bill. */
export class BillQuickBooksSyncDeclinedError extends Error {
  constructor(billId: string, skipReason: string | null) {
    super(
      skipReason?.trim()
        ? `Bill ${billId} was marked ready for payment without QuickBooks (${skipReason}).`
        : `Bill ${billId} was marked ready for payment without QuickBooks — materials and other skipped bills stay in WCI only.`,
    );
    this.name = "BillQuickBooksSyncDeclinedError";
  }
}

/** Global QBO_BILL_PUSH_ENABLED pause — no WCI → QBO bill creates/updates while unset/false. */
export class BillQuickBooksPushPausedError extends Error {
  constructor() {
    super(
      'QuickBooks bill push is paused (QBO_BILL_PUSH_ENABLED is not "true"). Buildertrend still owns QB pushes until cutover — nothing is sent from WCI OS until that env var is set to true on Netlify and the site is redeployed/env-reloaded.',
    );
    this.name = "BillQuickBooksPushPausedError";
  }
}

/** PAID/VOID (or paidAt set) bills must not be created in QBO as open unpaid AP. */
export class BillQuickBooksPushUnsafeStatusError extends Error {
  constructor(billId: string, approvalStatus: string) {
    super(
      `Bill ${billId} cannot be pushed to QuickBooks while its status is ${approvalStatus} (paid/void bills must never post as unpaid AP).`,
    );
    this.name = "BillQuickBooksPushUnsafeStatusError";
  }
}

/** Push only after READY_FOR_PAYMENT with an explicit sendToQuickBooks=true. */
export class BillQuickBooksPushNotReadyError extends Error {
  constructor(billId: string, detail: string) {
    super(`Bill ${billId} cannot be pushed to QuickBooks: ${detail}`);
    this.name = "BillQuickBooksPushNotReadyError";
  }
}

/** Blank or invented JOB_* invoice number — hold; do not invent. */
export class BillQuickBooksInvoiceNumberError extends Error {
  constructor(billId: string, reason: string) {
    super(`Bill ${billId}: ${reason}`);
    this.name = "BillQuickBooksInvoiceNumberError";
  }
}

export class BillQuickBooksDuplicateBlockedError extends Error {
  constructor(billId: string, reason: string) {
    super(`Bill ${billId} looks like a duplicate (${reason}). Refusing to create a second QuickBooks bill.`);
    this.name = "BillQuickBooksDuplicateBlockedError";
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

export interface SyncBillToQuickBooksOptions {
  /**
   * When true, run every guard and duplicate check but do not POST a new QBO Bill
   * (idempotent updates of an already-linked bill still return the existing id).
   */
  readonly dryRun?: boolean;
}

export interface SyncBillToQuickBooksResult {
  readonly qboBillId: string;
  readonly action: "created" | "updated" | "linked" | "dry_run_would_create" | "dry_run_would_update";
  readonly duplicateReason?: string;
}

/**
 * Push one Bill to QuickBooks, creating or updating as needed.
 * Money Rules 1–6 — see module header. Returns structured result; throws on refuse.
 */
export async function syncBillToQuickBooks(
  organizationId: string,
  billId: string,
  options: SyncBillToQuickBooksOptions = {},
): Promise<string> {
  const result = await syncBillToQuickBooksDetailed(organizationId, billId, options);
  return result.qboBillId;
}

export async function syncBillToQuickBooksDetailed(
  organizationId: string,
  billId: string,
  options: SyncBillToQuickBooksOptions = {},
): Promise<SyncBillToQuickBooksResult> {
  const dryRun = options.dryRun === true;

  // Global pause first — blocks READY_FOR_PAYMENT auto-push, Sync button, and any agent script.
  // Dry-run is allowed while paused so Money can list would-creates safely.
  if (!dryRun && !isQuickBooksBillPushEnabled()) {
    throw new BillQuickBooksPushPausedError();
  }

  const bill = await db.bill.findFirst({
    where: { id: billId, organizationId },
    include: { lineItems: { include: { costCode: true }, orderBy: { sortOrder: "asc" } }, job: true, vendor: true },
  });
  if (!bill) throw new BillNotFoundError(billId);

  // Rule 1 — never paid/void/historical paidAt
  if (isBillQuickBooksPushUnsafeByStatus(bill)) {
    throw new BillQuickBooksPushUnsafeStatusError(billId, bill.approvalStatus);
  }

  // Rule 5 — only after a person marked READY_FOR_PAYMENT with send=true
  if (bill.approvalStatus !== BillApprovalStatus.READY_FOR_PAYMENT) {
    throw new BillQuickBooksPushNotReadyError(
      billId,
      `status is ${bill.approvalStatus}, not READY_FOR_PAYMENT`,
    );
  }
  if (bill.sendToQuickBooks !== true) {
    throw new BillQuickBooksPushNotReadyError(
      billId,
      bill.sendToQuickBooks === false
        ? "sendToQuickBooks is false (materials / skipped)"
        : "sendToQuickBooks was never set true by an approver",
    );
  }
  if (isBillQuickBooksSyncBlocked(bill.sendToQuickBooks)) {
    throw new BillQuickBooksSyncDeclinedError(billId, bill.quickBooksSkipReason);
  }

  // Rule 2 — vendor invoice number exact; blank / JOB_* hold
  const numberBlock = vendorInvoiceNumberPushBlockReason(bill.billNumber);
  if (numberBlock) {
    throw new BillQuickBooksInvoiceNumberError(billId, numberBlock);
  }

  if (!bill.vendorId || !bill.vendor) throw new BillHasNoVendorError(billId);

  const totalCents = bill.lineItems.reduce((sum, line) => sum + line.amountCents, 0);

  // Rule 3 — OS duplicate check (link if twin already has qboBillId)
  const osDup = await findOsBillDuplicate({
    id: bill.id,
    organizationId,
    vendorId: bill.vendorId,
    vendorName: bill.vendorName,
    billNumber: bill.billNumber,
    issuedOn: bill.issuedOn,
    qboBillId: bill.qboBillId,
    totalCents,
  });

  if (osDup && !bill.qboBillId) {
    if (osDup.qboBillId) {
      if (!dryRun) {
        await db.bill.update({
          where: { id: bill.id },
          data: { qboBillId: osDup.qboBillId },
        });
        await recordSyncAttempt({
          organizationId,
          entityType: "BILL",
          direction: "TO_QBO",
          wciRecordId: bill.id,
          qboId: osDup.qboBillId,
          vendorName: bill.vendorName,
          docNumber: bill.billNumber,
          amountCents: totalCents,
          operation: "link",
        });
      }
      return {
        qboBillId: osDup.qboBillId,
        action: "linked",
        duplicateReason: osDup.reason,
      };
    }
    throw new BillQuickBooksDuplicateBlockedError(billId, `${osDup.reason} (OS bill ${osDup.billId})`);
  }

  try {
    if (dryRun && !isQuickBooksBillPushEnabled()) {
      // Pause on: still report would-create/update without talking to QBO.
      return {
        qboBillId: bill.qboBillId ?? "dry-run",
        action: bill.qboBillId ? "dry_run_would_update" : "dry_run_would_create",
      };
    }

    const vendorQboId = bill.vendor.qboVendorId ?? (await syncVendorToQuickBooks(organizationId, bill.vendor.id));
    const jobCustomerId = await optionalJobCustomerRef(organizationId, bill.job);
    const access = await getValidAccessToken(organizationId);

    // Rule 3 — QBO DocNumber lookup when not yet linked
    const linkedQboId = bill.qboBillId;
    if (!linkedQboId && bill.billNumber) {
      const qboHit = await findQboBillByDocNumber(access, bill.billNumber);
      if (qboHit) {
        if (!dryRun) {
          await db.bill.update({
            where: { id: bill.id },
            data: { qboBillId: qboHit.id, qboSyncToken: qboHit.syncToken },
          });
          await recordSyncAttempt({
            organizationId,
            entityType: "BILL",
            direction: "TO_QBO",
            wciRecordId: bill.id,
            qboId: qboHit.id,
            vendorName: bill.vendorName,
            docNumber: bill.billNumber,
            amountCents: totalCents,
            operation: "link",
          });
        }
        return {
          qboBillId: qboHit.id,
          action: "linked",
          duplicateReason: `QBO DocNumber already exists for "${bill.billNumber}"`,
        };
      }
    }

    if (dryRun) {
      return {
        qboBillId: linkedQboId ?? "dry-run",
        action: linkedQboId ? "dry_run_would_update" : "dry_run_would_create",
      };
    }

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

    // QBO DocNumber max length is 21. Truncate for QBO only; WCI keeps the full Bill.billNumber.
    const docNumber = bill.billNumber
      ? bill.billNumber.length <= 21
        ? bill.billNumber
        : bill.billNumber.slice(0, 21)
      : undefined;

    const billFields = {
      VendorRef: { value: vendorQboId },
      Line: lines,
      ...(docNumber ? { DocNumber: docNumber } : {}),
      ...(bill.issuedOn ? { TxnDate: bill.issuedOn.toISOString().slice(0, 10) } : {}),
      ...(bill.dueOn ? { DueDate: bill.dueOn.toISOString().slice(0, 10) } : {}),
    };

    const wasUpdate = Boolean(linkedQboId);
    const qboBill = linkedQboId
      ? await accountingRequest<{ Bill: QboRef }>({
          ...access,
          method: "POST",
          path: "bill",
          body: { Id: linkedQboId, SyncToken: await currentSyncToken(access, linkedQboId), sparse: true, ...billFields },
        })
      : await accountingRequest<{ Bill: QboRef }>({ ...access, method: "POST", path: "bill", body: billFields });

    await db.bill.update({ where: { id: bill.id }, data: { qboBillId: qboBill.Bill.Id, qboSyncToken: qboBill.Bill.SyncToken } });
    await recordSyncAttempt({
      organizationId,
      entityType: "BILL",
      direction: "TO_QBO",
      wciRecordId: bill.id,
      qboId: qboBill.Bill.Id,
      vendorName: bill.vendorName,
      docNumber: bill.billNumber,
      amountCents: totalCents,
      operation: wasUpdate ? "update" : "create",
    });
    return { qboBillId: qboBill.Bill.Id, action: wasUpdate ? "updated" : "created" };
  } catch (error) {
    if (error instanceof BillQuickBooksDuplicateBlockedError) {
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
      operation: bill.qboBillId ? "update" : "create",
    });
    throw error;
  }
}

/** QBO's SyncToken drifts if the bill was touched in QBO directly — refetch it right before an update rather than trust our cached copy. */
async function currentSyncToken(access: ValidQuickBooksAccess, qboBillId: string): Promise<string> {
  const existing = await accountingRequest<{ Bill: QboRef }>({ ...access, method: "GET", path: `bill/${qboBillId}` });
  return existing.Bill.SyncToken;
}
