/**
 * Duke's weekly reconciliation job (CLAUDE.md 2.5's Duke hooks).
 *
 * Pulls the week's QuickBooks Online `Purchase` transactions (src/lib/quickbooks/
 * transactions.ts — the existing QuickBooksConnection, no new QBO connection) and
 * cross-checks each one against jobs and bills Duke has already created, reusing the
 * exact road-name matching logic behind POST /purchase-orders/match-by-road-name
 * (src/lib/matching/road-name.ts) rather than a second copy of that heuristic.
 *
 * Every transaction lands in exactly one bucket:
 *   - MATCHED       — a Bill already on file has the same vendor, amount, and a nearby
 *                      date. Nothing left for Duke to do.
 *   - JOB_SUGGESTED — no Bill yet, but the road-name matcher found one confident job.
 *                      Left for Duke to turn into a Bill; not created automatically —
 *                      same "explicit conversion action" principle as every other
 *                      source->record conversion in CLAUDE.md 2.3.
 *   - UNMATCHED     — no Bill and no confident job. Raises bill.unmatched_transaction,
 *                      the same event Duke already raises when a single transaction
 *                      can't be placed in real time (CLAUDE.md 2.5) — this just covers
 *                      everything in the week in one batch instead of relying on that
 *                      happening live.
 *
 * The run itself is persisted (ReconciliationRun) so it stays visible/queryable after
 * the fact, the same "don't silently drop it" principle as QboSyncLog/WebhookDelivery.
 */

import { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { ACTIVE_JOB_STATUSES } from "@/lib/job-status";
import { matchJobsByRoadName, type JobMatchCandidate } from "@/lib/matching/road-name";
import { getWeeklyPurchases, type QboPurchaseTransaction } from "@/lib/quickbooks/transactions";
import { emitEvent } from "@/lib/webhooks";

const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * How far a Bill's date may sit from the transaction's TxnDate and still count as the
 * same purchase. Bills are often entered a few days after the card actually posted
 * (Duke reconciles Amex/Regions daily, but not everything gets a same-day bill), so
 * this is deliberately looser than a same-day check.
 */
const BILL_DATE_TOLERANCE_MS = 10 * 24 * 60 * 60 * 1000;

export interface CandidateBill {
  readonly id: string;
  readonly jobId: string;
  readonly jobName: string;
  readonly vendorName: string;
  readonly totalCents: number;
  readonly referenceDate: Date;
}

export interface ReconciliationTransactionResult {
  readonly qboId: string;
  readonly txnDate: string;
  readonly accountName: string | null;
  readonly payeeName: string | null;
  readonly totalCents: number;
  readonly memo: string | null;
  readonly status: "MATCHED" | "JOB_SUGGESTED" | "UNMATCHED";
  readonly matchedBillId: string | null;
  readonly matchedJobId: string | null;
  readonly matchedJobName: string | null;
  readonly matchScore: number | null;
  readonly matchReason: string | null;
}

/** Lowercased, alphanumeric-only — strong enough to compare "Sherwin Williams #4521" to "SHERWIN WILLIAMS". */
function normalizeVendorName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** Guards against a normalized name so short ("ace", "hd") that containment is meaningless. */
const MIN_VENDOR_NAME_LENGTH = 4;

function vendorNamesLikelyMatch(a: string, b: string): boolean {
  const normalizedA = normalizeVendorName(a);
  const normalizedB = normalizeVendorName(b);
  if (normalizedA.length < MIN_VENDOR_NAME_LENGTH || normalizedB.length < MIN_VENDOR_NAME_LENGTH) {
    return normalizedA === normalizedB && normalizedA.length > 0;
  }
  return normalizedA.includes(normalizedB) || normalizedB.includes(normalizedA);
}

function findMatchingBill(
  transaction: QboPurchaseTransaction,
  candidateBills: readonly CandidateBill[],
): CandidateBill | null {
  if (!transaction.payeeName) return null;

  const txnDate = new Date(transaction.txnDate);
  let best: { bill: CandidateBill; dateDeltaMs: number } | null = null;

  for (const bill of candidateBills) {
    if (bill.totalCents !== transaction.totalCents) continue;
    if (!vendorNamesLikelyMatch(transaction.payeeName, bill.vendorName)) continue;

    const dateDeltaMs = Math.abs(bill.referenceDate.getTime() - txnDate.getTime());
    if (dateDeltaMs > BILL_DATE_TOLERANCE_MS) continue;

    if (!best || dateDeltaMs < best.dateDeltaMs) {
      best = { bill, dateDeltaMs };
    }
  }

  return best?.bill ?? null;
}

/**
 * Classify one QBO transaction against already-created Bills and active Jobs. Pure —
 * no I/O — so the matching behavior is unit-testable without a database or a live QBO
 * call (src/lib/reconciliation/weekly-service.test.ts).
 */
export function classifyTransaction(
  transaction: QboPurchaseTransaction,
  candidateBills: readonly CandidateBill[],
  candidateJobs: readonly JobMatchCandidate[],
): ReconciliationTransactionResult {
  const base = {
    qboId: transaction.qboId,
    txnDate: transaction.txnDate,
    accountName: transaction.accountName,
    payeeName: transaction.payeeName,
    totalCents: transaction.totalCents,
    memo: transaction.memo,
  };

  const matchedBill = findMatchingBill(transaction, candidateBills);
  if (matchedBill) {
    return {
      ...base,
      status: "MATCHED",
      matchedBillId: matchedBill.id,
      matchedJobId: matchedBill.jobId,
      matchedJobName: matchedBill.jobName,
      matchScore: null,
      matchReason: `Vendor and $${(matchedBill.totalCents / 100).toFixed(2)} match Bill ${matchedBill.id}`,
    };
  }

  // No bill yet — try to at least point Duke at the right job, the same way
  // /purchase-orders/match-by-road-name does for a raw transaction string.
  const query = [transaction.payeeName, transaction.lineDescription, transaction.memo].filter(Boolean).join(" ");
  const roadNameMatch = matchJobsByRoadName(query, candidateJobs);

  if (roadNameMatch.bestMatch) {
    return {
      ...base,
      status: "JOB_SUGGESTED",
      matchedBillId: null,
      matchedJobId: roadNameMatch.bestMatch.job.id,
      matchedJobName: roadNameMatch.bestMatch.job.name,
      matchScore: roadNameMatch.bestMatch.score,
      matchReason: roadNameMatch.bestMatch.reason,
    };
  }

  return {
    ...base,
    status: "UNMATCHED",
    matchedBillId: null,
    matchedJobId: null,
    matchedJobName: null,
    matchScore: null,
    matchReason: null,
  };
}

export interface RunWeeklyReconciliationInput {
  readonly organizationId: string;
  /** Defaults to seven days before periodEnd. */
  readonly periodStart?: Date;
  /** Defaults to now. */
  readonly periodEnd?: Date;
}

export interface WeeklyReconciliationSummary {
  readonly id: string;
  readonly organizationId: string;
  readonly periodStart: Date;
  readonly periodEnd: Date;
  readonly transactionsPulled: number;
  readonly matchedCount: number;
  readonly jobSuggestedCount: number;
  readonly unmatchedCount: number;
  readonly transactions: readonly ReconciliationTransactionResult[];
  readonly createdAt: Date;
}

export async function runWeeklyReconciliation(input: RunWeeklyReconciliationInput): Promise<WeeklyReconciliationSummary> {
  const periodEnd = input.periodEnd ?? new Date();
  const periodStart = input.periodStart ?? new Date(periodEnd.getTime() - ONE_WEEK_MS);

  const transactions = await getWeeklyPurchases(input.organizationId, periodStart, periodEnd);

  const [jobs, bills] = await Promise.all([
    db.job.findMany({
      where: { organizationId: input.organizationId, isTemplate: false, status: { in: [...ACTIVE_JOB_STATUSES] } },
      select: { id: true, name: true, prefix: true, addressLine1: true },
    }),
    db.bill.findMany({
      where: {
        organizationId: input.organizationId,
        OR: [
          { issuedOn: { gte: new Date(periodStart.getTime() - BILL_DATE_TOLERANCE_MS), lte: new Date(periodEnd.getTime() + BILL_DATE_TOLERANCE_MS) } },
          { createdAt: { gte: new Date(periodStart.getTime() - BILL_DATE_TOLERANCE_MS), lte: new Date(periodEnd.getTime() + BILL_DATE_TOLERANCE_MS) } },
        ],
      },
      select: {
        id: true,
        jobId: true,
        job: { select: { name: true } },
        vendorName: true,
        issuedOn: true,
        createdAt: true,
        lineItems: { select: { amountCents: true } },
      },
    }),
  ]);

  const candidateBills: readonly CandidateBill[] = bills.map((bill) => ({
    id: bill.id,
    jobId: bill.jobId,
    jobName: bill.job.name,
    vendorName: bill.vendorName,
    totalCents: bill.lineItems.reduce((sum, item) => sum + item.amountCents, 0),
    referenceDate: bill.issuedOn ?? bill.createdAt,
  }));

  const results = transactions.map((transaction) => classifyTransaction(transaction, candidateBills, jobs));

  const matchedCount = results.filter((result) => result.status === "MATCHED").length;
  const jobSuggestedCount = results.filter((result) => result.status === "JOB_SUGGESTED").length;
  const unmatchedCount = results.filter((result) => result.status === "UNMATCHED").length;

  const run = await db.reconciliationRun.create({
    data: {
      organizationId: input.organizationId,
      periodStart,
      periodEnd,
      transactionsPulled: transactions.length,
      matchedCount,
      jobSuggestedCount,
      unmatchedCount,
      transactions: results as unknown as Prisma.InputJsonValue,
    },
  });

  // One bill.unmatched_transaction per unmatched line — Duke's existing downstream
  // handling for that event works unchanged, whether it fires live or from this batch.
  await Promise.all(
    results
      .filter((result): result is ReconciliationTransactionResult & { status: "UNMATCHED" } => result.status === "UNMATCHED")
      .map((result) =>
        emitEvent(input.organizationId, "bill.unmatched_transaction", {
          runId: run.id,
          qboTransactionId: result.qboId,
          txnDate: result.txnDate,
          accountName: result.accountName,
          payeeName: result.payeeName,
          totalCents: result.totalCents,
          memo: result.memo,
        }),
      ),
  );

  await emitEvent(input.organizationId, "reconciliation.weekly_completed", {
    runId: run.id,
    periodStart: periodStart.toISOString(),
    periodEnd: periodEnd.toISOString(),
    transactionsPulled: transactions.length,
    matchedCount,
    jobSuggestedCount,
    unmatchedCount,
  });

  return {
    id: run.id,
    organizationId: input.organizationId,
    periodStart,
    periodEnd,
    transactionsPulled: transactions.length,
    matchedCount,
    jobSuggestedCount,
    unmatchedCount,
    transactions: results,
    createdAt: run.createdAt,
  };
}

export interface ReconciliationRunSummary {
  readonly id: string;
  readonly periodStart: Date;
  readonly periodEnd: Date;
  readonly transactionsPulled: number;
  readonly matchedCount: number;
  readonly jobSuggestedCount: number;
  readonly unmatchedCount: number;
  readonly transactions: readonly ReconciliationTransactionResult[];
  readonly createdAt: Date;
}

/** Most recent runs first, for Duke/Jarvis to review history without recomputing anything. */
export async function listReconciliationRuns(organizationId: string, limit = 20): Promise<readonly ReconciliationRunSummary[]> {
  const runs = await db.reconciliationRun.findMany({
    where: { organizationId },
    orderBy: { periodEnd: "desc" },
    take: limit,
  });

  return runs.map((run) => ({
    id: run.id,
    periodStart: run.periodStart,
    periodEnd: run.periodEnd,
    transactionsPulled: run.transactionsPulled,
    matchedCount: run.matchedCount,
    jobSuggestedCount: run.jobSuggestedCount,
    unmatchedCount: run.unmatchedCount,
    transactions: run.transactions as unknown as readonly ReconciliationTransactionResult[],
    createdAt: run.createdAt,
  }));
}
