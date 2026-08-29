/**
 * The commitment funnel — the financial core of WCI OS (CLAUDE.md 2.3).
 *
 *   originalBudgetCost → revisedBudgetCost → pendingCost → committedCost
 *     → actualCost → projectedCost → costToComplete
 *
 * Everything downstream (invoicing, the six reports, job costing views) reads from
 * this, so it is deliberately pure: no database, no framework, no I/O. Callers load
 * the rows and hand them in; this module only does arithmetic.
 *
 * The single most important invariant: **the layers overlap and must never be
 * summed.** A PO that has been billed appears in both `committedCost` and
 * `actualCost`. Projecting a job's cost therefore takes the *greatest* of the
 * layers rather than adding them, which is why `projectedCost` is a max and not a
 * sum. Getting this wrong silently double-counts every job's cost.
 */

import { ContractType, type CostType } from "@/generated/prisma/enums";
import { contractTypePolicy, type RateMode } from "@/lib/contract-type";
import {
  applyMargin,
  applyMarkup,
  marginBasisPoints,
  roundHalfAwayFromZero,
  type BasisPoints,
  type Cents,
} from "@/lib/money";

/** Which funnel layer drives projectedCost. */
export type ProjectionReference = "GREATEST" | "REVISED_BUDGET" | "COMMITTED" | "ACTUAL";

/** Accrual counts open + paid bills as actual; cash counts only paid bills. */
export type AccountingBasis = "ACCRUAL" | "CASH";

/** PO statuses, mirrored from the schema so this module stays framework-free. */
export type PurchaseOrderStatus =
  | "DRAFT"
  | "PENDING_APPROVAL"
  | "APPROVED"
  | "DECLINED"
  | "COMPLETED"
  | "CANCELLED";

export type BillApprovalStatus = "IN_REVIEW" | "APPROVED" | "READY_FOR_PAYMENT" | "PAID" | "VOID";

export type InvoiceStatus = "DRAFT" | "SENT" | "PARTIALLY_PAID" | "PAID" | "VOID";

/**
 * Job-level invoice input for `amountInvoiced` / `remainingToInvoice` (CLAUDE.md
 * 2.3's Budget.clientPricing). Invoices are not tied to a cost code the way POs and
 * bills are — a progress invoice bills against the whole contract — so this tracking
 * is a job total, not a per-line figure like the rest of the funnel.
 */
export interface InvoiceCostInput {
  readonly status: InvoiceStatus;
  readonly amountCents: Cents;
}

/** A draft invoice hasn't gone out yet, so it doesn't count as billed. Void never counts. */
function countsAsInvoiced(status: InvoiceStatus): boolean {
  return status !== "DRAFT" && status !== "VOID";
}

/** The authored numbers for one Job × CostCode. */
export interface BudgetLineInput {
  readonly costCodeId: string;
  readonly originalBudgetCostCents: Cents;
  readonly revisedBudgetCostCents: Cents;
  readonly originalClientPriceCents: Cents;
  readonly revisedClientPriceCents: Cents;
  readonly rateMode: RateMode;
  readonly rateBasisPoints: BasisPoints;
}

export interface PurchaseOrderCostInput {
  readonly costCodeId: string;
  readonly status: PurchaseOrderStatus;
  readonly amountCents: Cents;
}

export interface BillCostInput {
  readonly costCodeId: string;
  readonly approvalStatus: BillApprovalStatus;
  readonly amountCents: Cents;
}

/**
 * Labor that has been worked but not yet approved into a bill. Buildertrend counts
 * this toward committed cost, because the money is owed whether or not the timesheet
 * has been signed off.
 */
export interface UnapprovedLaborInput {
  readonly costCodeId: string;
  readonly amountCents: Cents;
}

export interface ComputeFunnelOptions {
  readonly projectionReference?: ProjectionReference;
  readonly accountingBasis?: AccountingBasis;
}

export interface FunnelLine {
  readonly costCodeId: string;

  // Cost layers, outermost to innermost.
  readonly originalBudgetCostCents: Cents;
  readonly revisedBudgetCostCents: Cents;
  /** Unapproved POs — money likely to be committed but not yet. */
  readonly pendingCostCents: Cents;
  /** Approved POs plus unapproved labor — money we are on the hook for. */
  readonly committedCostCents: Cents;
  /** Billed cost, per the accounting basis. */
  readonly actualCostCents: Cents;
  /** What the job is expected to cost in total. */
  readonly projectedCostCents: Cents;
  /** Projected minus actual — what is still expected to be spent. */
  readonly costToCompleteCents: Cents;

  // Client-facing pricing.
  readonly originalClientPriceCents: Cents;
  readonly revisedClientPriceCents: Cents;

  // Profit, always measured against projected cost.
  readonly projectedProfitCents: Cents;
  readonly projectedMarginBasisPoints: BasisPoints;

  /** True when projected cost has passed the revised budget. */
  readonly isOverBudget: boolean;
  readonly varianceCents: Cents;
}

/** A PO counts as committed only once it is actually approved. */
function isCommittedStatus(status: PurchaseOrderStatus): boolean {
  return status === "APPROVED" || status === "COMPLETED";
}

/**
 * A PO counts as pending while it is still moving toward approval. Declined and
 * cancelled POs are dead and count toward nothing.
 */
function isPendingStatus(status: PurchaseOrderStatus): boolean {
  return status === "DRAFT" || status === "PENDING_APPROVAL";
}

/**
 * Which bills count as actual cost. Void bills never count. Under cash basis only
 * paid bills do; under accrual, everything that is a real liability does.
 */
function countsAsActual(status: BillApprovalStatus, basis: AccountingBasis): boolean {
  if (status === "VOID") return false;
  if (basis === "CASH") return status === "PAID";
  return true;
}

function sumBy<T>(items: readonly T[], predicate: (item: T) => boolean, amount: (item: T) => Cents): Cents {
  return items.reduce((total, item) => (predicate(item) ? total + amount(item) : total), 0);
}

/**
 * Choose projected cost from the funnel layers.
 *
 * GREATEST is the default and the honest one: a job is projected at the worst
 * number anyone knows about. The explicit references exist because a PM sometimes
 * needs to report strictly against the budget or strictly against what has been
 * committed — but even then, projected cost can never be lower than what has
 * already been spent, since that money is gone.
 */
export function selectProjectedCost(
  layers: { revised: Cents; committed: Cents; actual: Cents },
  reference: ProjectionReference,
): Cents {
  switch (reference) {
    case "REVISED_BUDGET":
      return Math.max(layers.revised, layers.actual);
    case "COMMITTED":
      return Math.max(layers.committed, layers.actual);
    case "ACTUAL":
      return layers.actual;
    case "GREATEST":
      return Math.max(layers.revised, layers.committed, layers.actual);
  }
}

/** Compute the funnel for a single cost code. */
export function computeFunnelLine(
  budgetLine: BudgetLineInput,
  purchaseOrders: readonly PurchaseOrderCostInput[],
  bills: readonly BillCostInput[],
  unapprovedLabor: readonly UnapprovedLaborInput[] = [],
  options: ComputeFunnelOptions = {},
): FunnelLine {
  const projectionReference = options.projectionReference ?? "GREATEST";
  const accountingBasis = options.accountingBasis ?? "ACCRUAL";
  const { costCodeId } = budgetLine;

  const forThisCode = <T extends { costCodeId: string }>(items: readonly T[]) =>
    items.filter((item) => item.costCodeId === costCodeId);

  const codePurchaseOrders = forThisCode(purchaseOrders);
  const codeBills = forThisCode(bills);
  const codeLabor = forThisCode(unapprovedLabor);

  const pendingCostCents = sumBy(codePurchaseOrders, (po) => isPendingStatus(po.status), (po) => po.amountCents);

  const approvedPoCents = sumBy(codePurchaseOrders, (po) => isCommittedStatus(po.status), (po) => po.amountCents);
  const unapprovedLaborCents = codeLabor.reduce((total, entry) => total + entry.amountCents, 0);
  const committedCostCents = approvedPoCents + unapprovedLaborCents;

  const actualCostCents = sumBy(
    codeBills,
    (bill) => countsAsActual(bill.approvalStatus, accountingBasis),
    (bill) => bill.amountCents,
  );

  const projectedCostCents = selectProjectedCost(
    { revised: budgetLine.revisedBudgetCostCents, committed: committedCostCents, actual: actualCostCents },
    projectionReference,
  );

  // Cost to complete is never negative: once actual exceeds projected there is
  // nothing left to spend, not a negative amount left to spend.
  const costToCompleteCents = Math.max(0, projectedCostCents - actualCostCents);

  const projectedProfitCents = budgetLine.revisedClientPriceCents - projectedCostCents;

  return {
    costCodeId,
    originalBudgetCostCents: budgetLine.originalBudgetCostCents,
    revisedBudgetCostCents: budgetLine.revisedBudgetCostCents,
    pendingCostCents,
    committedCostCents,
    actualCostCents,
    projectedCostCents,
    costToCompleteCents,
    originalClientPriceCents: budgetLine.originalClientPriceCents,
    revisedClientPriceCents: budgetLine.revisedClientPriceCents,
    projectedProfitCents,
    projectedMarginBasisPoints: marginBasisPoints(budgetLine.revisedClientPriceCents, projectedCostCents),
    isOverBudget: projectedCostCents > budgetLine.revisedBudgetCostCents,
    varianceCents: budgetLine.revisedBudgetCostCents - projectedCostCents,
  };
}

export interface FunnelTotals {
  readonly originalBudgetCostCents: Cents;
  readonly revisedBudgetCostCents: Cents;
  readonly pendingCostCents: Cents;
  readonly committedCostCents: Cents;
  readonly actualCostCents: Cents;
  readonly projectedCostCents: Cents;
  readonly costToCompleteCents: Cents;
  readonly originalClientPriceCents: Cents;
  readonly revisedClientPriceCents: Cents;
  readonly projectedProfitCents: Cents;
  readonly projectedMarginBasisPoints: BasisPoints;
  readonly amountInvoicedCents: Cents;
  readonly remainingToInvoiceCents: Cents;
}

export interface JobFunnel {
  readonly lines: readonly FunnelLine[];
  readonly totals: FunnelTotals;
}

/** Compute the funnel for every cost code on a job, plus job-level totals. */
export function computeJobFunnel(
  budgetLines: readonly BudgetLineInput[],
  purchaseOrders: readonly PurchaseOrderCostInput[],
  bills: readonly BillCostInput[],
  unapprovedLabor: readonly UnapprovedLaborInput[] = [],
  options: ComputeFunnelOptions = {},
  invoices: readonly InvoiceCostInput[] = [],
): JobFunnel {
  const lines = budgetLines.map((line) =>
    computeFunnelLine(line, purchaseOrders, bills, unapprovedLabor, options),
  );

  const sum = (pick: (line: FunnelLine) => Cents): Cents => lines.reduce((total, line) => total + pick(line), 0);

  const revisedClientPriceCents = sum((line) => line.revisedClientPriceCents);
  const projectedCostCents = sum((line) => line.projectedCostCents);
  const amountInvoicedCents = sumBy(invoices, (invoice) => countsAsInvoiced(invoice.status), (invoice) => invoice.amountCents);

  return {
    lines,
    totals: {
      originalBudgetCostCents: sum((line) => line.originalBudgetCostCents),
      revisedBudgetCostCents: sum((line) => line.revisedBudgetCostCents),
      pendingCostCents: sum((line) => line.pendingCostCents),
      committedCostCents: sum((line) => line.committedCostCents),
      actualCostCents: sum((line) => line.actualCostCents),
      projectedCostCents,
      costToCompleteCents: sum((line) => line.costToCompleteCents),
      originalClientPriceCents: sum((line) => line.originalClientPriceCents),
      revisedClientPriceCents,
      projectedProfitCents: revisedClientPriceCents - projectedCostCents,
      projectedMarginBasisPoints: marginBasisPoints(revisedClientPriceCents, projectedCostCents),
      amountInvoicedCents,
      // Never negative: an overbilled job (a draw schedule totalling >100%, or a
      // late change order) has nothing left to invoice, not a negative amount.
      remainingToInvoiceCents: Math.max(0, revisedClientPriceCents - amountInvoicedCents),
    },
  };
}

/**
 * Recompute what the client owes for a line under the job's contract type.
 *
 * This is where the contract-type strategy meets the funnel: Fixed Price bills
 * against the budgeted number so overruns eat margin, while Open Book bills against
 * what was actually spent so overruns pass through. Both go through the same policy
 * object rather than branching here.
 */
export function clientPriceForLine(
  contractType: ContractType,
  line: FunnelLine,
  rateMode: RateMode,
  rateBasisPoints: BasisPoints,
): Cents {
  return contractTypePolicy(contractType).clientPriceCents({
    budgetedCostCents: line.revisedBudgetCostCents,
    actualCostCents: line.actualCostCents,
    rateBasisPoints,
    rateMode,
  });
}

/**
 * Price a cost with a rate, choosing markup or margin. Shared by the estimate
 * builder and the "send to budget" conversion so both price identically.
 */
export function priceWithRate(costCents: Cents, rateMode: RateMode, rateBasisPoints: BasisPoints): Cents {
  return rateMode === "MARGIN" ? applyMargin(costCents, rateBasisPoints) : applyMarkup(costCents, rateBasisPoints);
}

/** Extended cost of a quantity × unit-cost line, in cents. */
export function extendedCostCents(quantityMilli: number, unitCostCents: Cents): Cents {
  return roundHalfAwayFromZero((quantityMilli * unitCostCents) / 1000);
}

/**
 * An Estimate's client-facing grand total: each line's extended cost, priced with its
 * own rate. Shared by every place that shows an estimate/proposal-option total
 * (Lead Proposals list, the Proposal editor and PDF export, the client review page)
 * so they can't drift into computing it slightly differently.
 */
export function estimateTotalCents(
  lineItems: readonly { readonly quantityMilli: number; readonly unitCostCents: Cents; readonly rateMode: RateMode; readonly rateBasisPoints: BasisPoints }[],
): Cents {
  return lineItems.reduce((total, item) => total + priceWithRate(extendedCostCents(item.quantityMilli, item.unitCostCents), item.rateMode, item.rateBasisPoints), 0);
}

/** Cost types that count as labor, for the labor-actuals report and OT logic. */
export function isLaborCostType(costType: CostType): boolean {
  return costType === "LABOR";
}

export { ContractType };
