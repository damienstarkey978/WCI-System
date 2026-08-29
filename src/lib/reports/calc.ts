/**
 * Pure row/bucket computations for the six standard reports (CLAUDE.md 3). Each
 * function takes numbers already aggregated by the service layer — no database, no
 * framework — the same split used by the funnel and invoicing modules.
 */

import { marginBasisPoints, roundHalfAwayFromZero, type BasisPoints, type Cents } from "@/lib/money";

export interface JobSummary {
  readonly jobId: string;
  readonly jobName: string;
}

// ---------------------------------------------------------------------------
// 1. WIP (Work in Progress)
// ---------------------------------------------------------------------------

export interface WipInput extends JobSummary {
  readonly revisedClientPriceCents: Cents;
  readonly actualCostCents: Cents;
  readonly projectedCostCents: Cents;
  readonly amountInvoicedCents: Cents;
}

export interface WipRow extends JobSummary {
  readonly revisedClientPriceCents: Cents;
  readonly actualCostCents: Cents;
  readonly projectedCostCents: Cents;
  readonly percentCompleteBasisPoints: BasisPoints;
  /** Revenue earned so far, per percent complete applied to the contract price. */
  readonly earnedRevenueCents: Cents;
  readonly amountInvoicedCents: Cents;
  /** Positive: billed ahead of work done (overbilled). Negative: underbilled. */
  readonly overUnderBillingCents: Cents;
}

export function computeWipRow(input: WipInput): WipRow {
  const percentCompleteBasisPoints =
    input.projectedCostCents === 0
      ? 0
      : roundHalfAwayFromZero((input.actualCostCents / input.projectedCostCents) * 10_000);

  const earnedRevenueCents = roundHalfAwayFromZero(
    (input.revisedClientPriceCents * percentCompleteBasisPoints) / 10_000,
  );

  return {
    jobId: input.jobId,
    jobName: input.jobName,
    revisedClientPriceCents: input.revisedClientPriceCents,
    actualCostCents: input.actualCostCents,
    projectedCostCents: input.projectedCostCents,
    percentCompleteBasisPoints,
    earnedRevenueCents,
    amountInvoicedCents: input.amountInvoicedCents,
    overUnderBillingCents: input.amountInvoicedCents - earnedRevenueCents,
  };
}

// ---------------------------------------------------------------------------
// 2. Budgeted vs Projected
// ---------------------------------------------------------------------------

export interface BudgetedVsProjectedInput extends JobSummary {
  readonly originalBudgetCostCents: Cents;
  readonly revisedBudgetCostCents: Cents;
  readonly projectedCostCents: Cents;
}

export interface BudgetedVsProjectedRow extends BudgetedVsProjectedInput {
  readonly varianceCents: Cents;
  readonly isOverBudget: boolean;
}

export function computeBudgetedVsProjectedRow(input: BudgetedVsProjectedInput): BudgetedVsProjectedRow {
  const varianceCents = input.revisedBudgetCostCents - input.projectedCostCents;
  return { ...input, varianceCents, isOverBudget: varianceCents < 0 };
}

// ---------------------------------------------------------------------------
// 3. Profitability
// ---------------------------------------------------------------------------

export interface ProfitabilityInput extends JobSummary {
  readonly revisedClientPriceCents: Cents;
  readonly projectedCostCents: Cents;
}

export interface ProfitabilityRow extends ProfitabilityInput {
  readonly projectedProfitCents: Cents;
  readonly projectedMarginBasisPoints: BasisPoints;
}

export function computeProfitabilityRow(input: ProfitabilityInput): ProfitabilityRow {
  return {
    ...input,
    projectedProfitCents: input.revisedClientPriceCents - input.projectedCostCents,
    projectedMarginBasisPoints: marginBasisPoints(input.revisedClientPriceCents, input.projectedCostCents),
  };
}

/** Worst margin first, so problem jobs surface at the top of the report. */
export function sortByMarginAscending(rows: readonly ProfitabilityRow[]): readonly ProfitabilityRow[] {
  return [...rows].sort((a, b) => a.projectedMarginBasisPoints - b.projectedMarginBasisPoints);
}

// ---------------------------------------------------------------------------
// 4. Invoicing
// ---------------------------------------------------------------------------

export interface InvoicingInput extends JobSummary {
  readonly revisedClientPriceCents: Cents;
  readonly amountInvoicedCents: Cents;
  readonly remainingToInvoiceCents: Cents;
  readonly totalPaidCents: Cents;
}

export interface InvoicingRow extends InvoicingInput {
  readonly outstandingCents: Cents;
}

export function computeInvoicingRow(input: InvoicingInput): InvoicingRow {
  return { ...input, outstandingCents: input.amountInvoicedCents - input.totalPaidCents };
}

// ---------------------------------------------------------------------------
// 5. Labor Actuals vs Budgeted
// ---------------------------------------------------------------------------

export interface LaborInput extends JobSummary {
  readonly budgetedLaborCostCents: Cents;
  /** Approved timesheet cost to date — the best available proxy for "actual" until
   * payroll/Gusto sync exists. Base pay only; no overtime premium (see
   * src/lib/time-clock/hours.ts for why that's computed separately). */
  readonly approvedLaborCostCents: Cents;
}

export interface LaborRow extends LaborInput {
  readonly varianceCents: Cents;
  readonly isOverBudget: boolean;
}

export function computeLaborRow(input: LaborInput): LaborRow {
  const varianceCents = input.budgetedLaborCostCents - input.approvedLaborCostCents;
  return { ...input, varianceCents, isOverBudget: varianceCents < 0 };
}

// ---------------------------------------------------------------------------
// 6. Cash Flow (rolling window, historical + projected)
// ---------------------------------------------------------------------------

export interface CashEvent {
  /** ISO date (yyyy-mm-dd) the cash moved. */
  readonly date: string;
  readonly amountCents: Cents;
}

export interface CashFlowDay {
  readonly date: string;
  readonly cashInCents: Cents;
  readonly cashOutCents: Cents;
  readonly netCents: Cents;
}

/**
 * Bucket historical cash-in (invoice payments) and cash-out (paid bills) events
 * into one row per day across a window, filling days with no activity as zero
 * rather than omitting them — a report that silently skips quiet days is easy to
 * misread as a gap in the data rather than a day nothing happened.
 */
export function bucketCashFlowByDay(
  windowStartDate: string,
  windowDays: number,
  cashIn: readonly CashEvent[],
  cashOut: readonly CashEvent[],
): readonly CashFlowDay[] {
  const inByDate = new Map<string, Cents>();
  for (const event of cashIn) inByDate.set(event.date, (inByDate.get(event.date) ?? 0) + event.amountCents);

  const outByDate = new Map<string, Cents>();
  for (const event of cashOut) outByDate.set(event.date, (outByDate.get(event.date) ?? 0) + event.amountCents);

  const start = new Date(`${windowStartDate}T00:00:00Z`);
  const days: CashFlowDay[] = [];
  for (let i = 0; i < windowDays; i += 1) {
    const date = new Date(start.getTime() + i * 86_400_000).toISOString().slice(0, 10);
    const cashInCents = inByDate.get(date) ?? 0;
    const cashOutCents = outByDate.get(date) ?? 0;
    days.push({ date, cashInCents, cashOutCents, netCents: cashInCents - cashOutCents });
  }
  return days;
}

export interface CashFlowProjection {
  /** Sum of remainingToInvoice across active jobs — future cash in, if collected. */
  readonly projectedCashInCents: Cents;
  /** Sum of costToComplete across active jobs — future cash out, if spent as projected. */
  readonly projectedCashOutCents: Cents;
}

export interface CashFlowReport {
  readonly historical: readonly CashFlowDay[];
  readonly historicalNetCents: Cents;
  readonly projection: CashFlowProjection;
}

export function buildCashFlowReport(
  historical: readonly CashFlowDay[],
  projection: CashFlowProjection,
): CashFlowReport {
  return {
    historical,
    historicalNetCents: historical.reduce((total, day) => total + day.netCents, 0),
    projection,
  };
}

// ---------------------------------------------------------------------------
// 7. Change Order Profit
// ---------------------------------------------------------------------------

export interface ChangeOrderProfitInput extends JobSummary {
  readonly changeOrderCount: number;
  readonly totalCostCents: Cents;
  readonly totalClientPriceCents: Cents;
}

export interface ChangeOrderProfitRow extends ChangeOrderProfitInput {
  readonly profitCents: Cents;
}

export function computeChangeOrderProfitRow(input: ChangeOrderProfitInput): ChangeOrderProfitRow {
  return { ...input, profitCents: input.totalClientPriceCents - input.totalCostCents };
}

// ---------------------------------------------------------------------------
// 8. Baseline vs Actual Duration
// ---------------------------------------------------------------------------

const MS_PER_DAY = 86_400_000;

/** Whole days between two dates, rounded to the nearest day rather than floored. */
function daysBetween(start: Date, end: Date): number {
  return Math.round((end.getTime() - start.getTime()) / MS_PER_DAY);
}

export interface DurationInput extends JobSummary {
  /** Earliest baselineStart / latest baselineEnd across the job's schedule items with a snapshot, or null if none was ever taken. */
  readonly baselineStart: Date | null;
  readonly baselineEnd: Date | null;
  readonly actualStart: Date | null;
  /** Null while the job is still in progress — actualDurationDays is then measured against `asOf`. */
  readonly actualEnd: Date | null;
  readonly asOf: Date;
}

export interface DurationRow extends JobSummary {
  readonly baselineDurationDays: number | null;
  readonly actualDurationDays: number | null;
  readonly varianceDays: number | null;
}

export function computeDurationRow(input: DurationInput): DurationRow {
  const baselineDurationDays = input.baselineStart && input.baselineEnd ? daysBetween(input.baselineStart, input.baselineEnd) : null;
  const actualDurationDays = input.actualStart ? daysBetween(input.actualStart, input.actualEnd ?? input.asOf) : null;
  return {
    jobId: input.jobId,
    jobName: input.jobName,
    baselineDurationDays,
    actualDurationDays,
    varianceDays: baselineDurationDays !== null && actualDurationDays !== null ? actualDurationDays - baselineDurationDays : null,
  };
}
