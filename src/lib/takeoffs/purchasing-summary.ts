/**
 * Job-level purchasing rollup — purchased vs not-yet, order statuses, takeoff
 * coverage. Pure over loaded rows so the Purchasing page and Duke/Jarvis APIs share
 * one view of the commitment funnel without reinventing AP/PO logic.
 */

import { extendedCostCents, type PurchaseOrderStatus } from "@/lib/budget/funnel";
import type { Cents } from "@/lib/money";

export type TakeoffLineStatusLabel = "DRAFT" | "READY" | "QUEUED" | "ORDERED" | "CANCELLED";
export type PurchasingIntentStatusLabel = "QUEUED" | "CLAIMED" | "CONVERTED" | "CANCELLED";
export type PurchaseOrderWorkStatusLabel = "NOT_COMPLETE" | "WORK_COMPLETE";

export interface TakeoffLineSummaryInput {
  readonly id: string;
  readonly takeoffId: string;
  readonly takeoffTitle: string;
  readonly title: string;
  readonly costCodeId: string;
  readonly costCodeLabel: string;
  readonly quantityMilli: number;
  readonly unit: string | null;
  readonly unitCostCents: Cents;
  readonly status: TakeoffLineStatusLabel;
  readonly purchaseOrderId: string | null;
  readonly intentStatus: PurchasingIntentStatusLabel | null;
}

export interface PurchaseOrderSummaryInput {
  readonly id: string;
  readonly poNumber: string;
  readonly title: string | null;
  readonly vendorName: string;
  readonly status: PurchaseOrderStatus;
  readonly workStatus: PurchaseOrderWorkStatusLabel;
  readonly sourceType: string;
  readonly sourceId: string | null;
  readonly totalCents: Cents;
  readonly lineCostCodeIds: readonly string[];
}

export type PurchasingBucket = "not_yet" | "queued" | "on_order" | "purchased";

export interface PurchasingLineRow {
  readonly kind: "takeoff_line" | "purchase_order";
  readonly id: string;
  readonly label: string;
  readonly detail: string;
  readonly costCodeLabel: string | null;
  readonly amountCents: Cents;
  readonly bucket: PurchasingBucket;
  readonly statusLabel: string;
  readonly href: string;
  readonly takeoffId?: string;
  readonly purchaseOrderId?: string;
}

export interface JobPurchasingSummary {
  readonly totals: {
    readonly notYetCount: number;
    readonly notYetCents: Cents;
    readonly queuedCount: number;
    readonly queuedCents: Cents;
    readonly onOrderCount: number;
    readonly onOrderCents: Cents;
    readonly purchasedCount: number;
    readonly purchasedCents: Cents;
  };
  readonly rows: readonly PurchasingLineRow[];
}

function poBucket(po: PurchaseOrderSummaryInput): PurchasingBucket {
  if (po.status === "CANCELLED" || po.status === "DECLINED") {
    return "not_yet";
  }
  if (po.status === "COMPLETED" || po.workStatus === "WORK_COMPLETE") {
    return "purchased";
  }
  if (po.status === "APPROVED" || po.status === "PENDING_APPROVAL" || po.status === "DRAFT") {
    return "on_order";
  }
  return "on_order";
}

function poStatusLabel(po: PurchaseOrderSummaryInput): string {
  if (po.workStatus === "WORK_COMPLETE" && po.status !== "COMPLETED") {
    return `${po.status} · work complete`;
  }
  return po.status;
}

/**
 * Build the Purchasing page / API rollup.
 *
 * Takeoff lines that are already ORDERED (linked to a PO) are represented via the
 * PO row only — we don't double-count them under "purchased". Queued/claimed intents
 * stay as takeoff rows until converted.
 */
export function buildJobPurchasingSummary(input: {
  readonly jobId: string;
  readonly takeoffLines: readonly TakeoffLineSummaryInput[];
  readonly purchaseOrders: readonly PurchaseOrderSummaryInput[];
}): JobPurchasingSummary {
  const rows: PurchasingLineRow[] = [];

  for (const line of input.takeoffLines) {
    if (line.status === "CANCELLED") continue;
    if (line.status === "ORDERED") continue;

    const amountCents = extendedCostCents(line.quantityMilli, line.unitCostCents);
    const qty = (line.quantityMilli / 1_000).toString();
    const unitPart = line.unit ? ` ${line.unit}` : "";
    const detail = `${qty}${unitPart} · ${line.takeoffTitle}`;

    let bucket: PurchasingBucket = "not_yet";
    let statusLabel: string = line.status;
    if (line.status === "QUEUED" || line.intentStatus === "QUEUED" || line.intentStatus === "CLAIMED") {
      bucket = "queued";
      statusLabel = line.intentStatus === "CLAIMED" ? "CLAIMED by Estimating" : "QUEUED for Estimating";
    }

    rows.push({
      kind: "takeoff_line",
      id: line.id,
      label: line.title,
      detail,
      costCodeLabel: line.costCodeLabel,
      amountCents,
      bucket,
      statusLabel,
      href: `/jobs/${input.jobId}/takeoffs/${line.takeoffId}`,
      takeoffId: line.takeoffId,
    });
  }

  for (const po of input.purchaseOrders) {
    if (po.status === "CANCELLED" || po.status === "DECLINED") continue;
    const bucket = poBucket(po);
    rows.push({
      kind: "purchase_order",
      id: po.id,
      label: po.title ? `${po.poNumber} — ${po.title}` : po.poNumber,
      detail: po.vendorName,
      costCodeLabel: null,
      amountCents: po.totalCents,
      bucket,
      statusLabel: poStatusLabel(po),
      href: `/jobs/${input.jobId}/purchase-orders/${po.id}`,
      purchaseOrderId: po.id,
    });
  }

  const totals = {
    notYetCount: 0,
    notYetCents: 0,
    queuedCount: 0,
    queuedCents: 0,
    onOrderCount: 0,
    onOrderCents: 0,
    purchasedCount: 0,
    purchasedCents: 0,
  };

  for (const row of rows) {
    if (row.bucket === "not_yet") {
      totals.notYetCount += 1;
      totals.notYetCents += row.amountCents;
    } else if (row.bucket === "queued") {
      totals.queuedCount += 1;
      totals.queuedCents += row.amountCents;
    } else if (row.bucket === "on_order") {
      totals.onOrderCount += 1;
      totals.onOrderCents += row.amountCents;
    } else {
      totals.purchasedCount += 1;
      totals.purchasedCents += row.amountCents;
    }
  }

  const bucketOrder: Record<PurchasingBucket, number> = {
    not_yet: 0,
    queued: 1,
    on_order: 2,
    purchased: 3,
  };
  rows.sort((a, b) => bucketOrder[a.bucket] - bucketOrder[b.bucket] || a.label.localeCompare(b.label));

  return { totals, rows };
}
