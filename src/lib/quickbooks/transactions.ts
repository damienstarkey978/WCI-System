/**
 * Read-only pull of QuickBooks Online `Purchase` transactions — the entity QBO uses for
 * both credit-card charges and bank-account payments, which is how Amex and Regions
 * activity actually lands in the company file once QBO's own bank feed has categorized
 * it. There is no separate "bank transaction" model in WCI OS (CLAUDE.md 2.5 lists "QBO
 * Expenses" as a target sync direction with nothing built yet); this is that seam.
 *
 * Deliberately read-only and un-synced: this never writes a QboSyncLog row, because
 * nothing here pushes anything to QBO or claims a WCI record now represents a QBO one.
 * It only asks "what did QuickBooks see this week" for Duke's weekly reconciliation
 * (src/lib/reconciliation/weekly-service.ts) to cross-check against.
 *
 * Goes through the existing QuickBooksConnection (getValidAccessToken) — no new
 * QuickBooks connection or credentials, per the task's own instruction.
 */

import { accountingRequest } from "@/lib/quickbooks/client";
import { getValidAccessToken } from "@/lib/quickbooks/connection-service";

export interface QboPurchaseTransaction {
  readonly qboId: string;
  /** ISO date (YYYY-MM-DD), as QBO reports it — Purchase has no time component. */
  readonly txnDate: string;
  /** The paying account's name, e.g. "Amex Business Card", "Regions Checking". */
  readonly accountName: string | null;
  /** The vendor/payee QBO has on file for this transaction, if any. */
  readonly payeeName: string | null;
  readonly totalCents: number;
  readonly memo: string | null;
  /** Line-level descriptions joined together — often where a job address ends up. */
  readonly lineDescription: string | null;
}

function centsFromAmount(amount: unknown): number {
  return typeof amount === "number" && Number.isFinite(amount) ? Math.round(amount * 100) : 0;
}

function stringField(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

interface QboRefLike {
  readonly name?: unknown;
}

function refName(value: unknown): string | null {
  if (typeof value !== "object" || value === null) return null;
  return stringField((value as QboRefLike).name);
}

interface QboLineLike {
  readonly Description?: unknown;
}

function joinedLineDescriptions(lines: unknown): string | null {
  if (!Array.isArray(lines)) return null;
  const descriptions = lines
    .map((line) => stringField((line as QboLineLike)?.Description))
    .filter((description): description is string => description !== null);
  return descriptions.length > 0 ? descriptions.join(" | ") : null;
}

/**
 * Normalize one raw QBO `Purchase` entity into the shape the reconciliation matcher
 * consumes. Pure so it is unit-testable against fixture JSON without a live QBO call.
 * Returns null for a malformed entry (missing Id/TxnDate) rather than throwing — one
 * bad row from QBO should never fail the whole week's pull.
 */
export function normalizeQboPurchase(raw: unknown): QboPurchaseTransaction | null {
  if (typeof raw !== "object" || raw === null) return null;
  const record = raw as Record<string, unknown>;

  const qboId = stringField(record.Id);
  const txnDate = stringField(record.TxnDate);
  if (!qboId || !txnDate) return null;

  return {
    qboId,
    txnDate,
    accountName: refName(record.AccountRef),
    payeeName: refName(record.EntityRef),
    totalCents: centsFromAmount(record.TotalAmt),
    memo: stringField(record.PrivateNote),
    lineDescription: joinedLineDescriptions(record.Line),
  };
}

function qboDateString(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Escapes a value dropped into a QBO query-language string literal. */
function escapeQboQueryString(value: string): string {
  return value.replace(/'/g, "\\'");
}

/**
 * Pull every `Purchase` QBO recorded with a TxnDate in [periodStart, periodEnd]
 * (inclusive), across every paying account — Amex and Regions both land here once
 * they're set up as accounts in the connected company file, so there is nothing
 * account-specific to filter on here.
 */
export async function getWeeklyPurchases(
  organizationId: string,
  periodStart: Date,
  periodEnd: Date,
): Promise<readonly QboPurchaseTransaction[]> {
  const { accessToken, realmId, environment } = await getValidAccessToken(organizationId);

  const startDate = escapeQboQueryString(qboDateString(periodStart));
  const endDate = escapeQboQueryString(qboDateString(periodEnd));

  const transactions: QboPurchaseTransaction[] = [];
  const pageSize = 200;
  let startPosition = 1;

  // QBO paginates query results; loop until a page comes back short of a full page.
  for (;;) {
    const response = await accountingRequest<{
      QueryResponse?: { Purchase?: unknown[] };
    }>({
      environment,
      accessToken,
      realmId,
      method: "GET",
      path: "query",
      query: {
        query: `SELECT * FROM Purchase WHERE TxnDate >= '${startDate}' AND TxnDate <= '${endDate}' ORDERBY TxnDate ASC STARTPOSITION ${startPosition} MAXRESULTS ${pageSize}`,
      },
    });

    const page = response.QueryResponse?.Purchase ?? [];
    for (const raw of page) {
      const normalized = normalizeQboPurchase(raw);
      if (normalized) transactions.push(normalized);
    }

    if (page.length < pageSize) break;
    startPosition += pageSize;
  }

  return transactions;
}
