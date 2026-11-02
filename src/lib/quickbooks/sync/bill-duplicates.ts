/**
 * Pre-push duplicate detection (Money rule 3): same vendor + amount + invoice
 * date OR same invoice number → do not create a second QBO bill; link instead.
 */

import { BillApprovalStatus } from "@/generated/prisma/enums";
import { normalizeVendorInvoiceNumber } from "@/lib/bills/bill-number";
import { db } from "@/lib/db";
import { accountingRequest } from "@/lib/quickbooks/client";
import type { ValidQuickBooksAccess } from "@/lib/quickbooks/connection-service";

export interface BillDupProbe {
  readonly id: string;
  readonly organizationId: string;
  readonly vendorId: string | null;
  readonly vendorName: string;
  readonly billNumber: string | null;
  readonly issuedOn: Date | null;
  readonly qboBillId: string | null;
  readonly totalCents: number;
}

export interface OsDuplicateMatch {
  readonly billId: string;
  readonly qboBillId: string | null;
  readonly billNumber: string | null;
  readonly reason: string;
}

function sameCalendarDay(a: Date | null, b: Date | null): boolean {
  if (!a || !b) return false;
  return a.toISOString().slice(0, 10) === b.toISOString().slice(0, 10);
}

/**
 * Find another non-VOID OS bill that looks like the same vendor invoice.
 * Prefer a twin that already has qboBillId so we can link instead of create.
 */
export async function findOsBillDuplicate(probe: BillDupProbe): Promise<OsDuplicateMatch | null> {
  const number = normalizeVendorInvoiceNumber(probe.billNumber);

  const candidates = await db.bill.findMany({
    where: {
      organizationId: probe.organizationId,
      id: { not: probe.id },
      approvalStatus: { not: BillApprovalStatus.VOID },
      OR: [
        ...(probe.vendorId ? [{ vendorId: probe.vendorId }] : []),
        { vendorName: { equals: probe.vendorName, mode: "insensitive" as const } },
      ],
    },
    select: {
      id: true,
      billNumber: true,
      issuedOn: true,
      qboBillId: true,
      lineItems: { select: { amountCents: true } },
    },
    take: 200,
  });

  const matches: OsDuplicateMatch[] = [];
  for (const candidate of candidates) {
    const candidateTotal = candidate.lineItems.reduce((sum, line) => sum + line.amountCents, 0);
    const candidateNumber = normalizeVendorInvoiceNumber(candidate.billNumber);
    const numberMatch = Boolean(number && candidateNumber && number === candidateNumber);
    const amountDateMatch =
      candidateTotal === probe.totalCents && sameCalendarDay(candidate.issuedOn, probe.issuedOn);

    if (!numberMatch && !amountDateMatch) continue;

    matches.push({
      billId: candidate.id,
      qboBillId: candidate.qboBillId,
      billNumber: candidate.billNumber,
      reason: numberMatch
        ? `Same vendor invoice number "${number}"`
        : `Same vendor + amount ${probe.totalCents}¢ + invoice date`,
    });
  }

  if (matches.length === 0) return null;
  // Prefer a twin already linked to QBO so push can attach instead of creating.
  return matches.find((m) => m.qboBillId) ?? matches[0]!;
}

interface QboBillRow {
  readonly Id: string;
  readonly DocNumber?: string;
  readonly SyncToken?: string;
}

/**
 * Cheap QBO lookup by DocNumber when the vendor invoice number is present.
 * Returns the first open match (caller links qboBillId — does not create).
 */
export async function findQboBillByDocNumber(
  access: ValidQuickBooksAccess,
  docNumber: string,
): Promise<{ id: string; syncToken: string | null } | null> {
  const escaped = docNumber.replace(/'/g, "\\'").slice(0, 21);
  if (!escaped) return null;

  const found = await accountingRequest<{ QueryResponse: { Bill?: QboBillRow[] } }>({
    ...access,
    method: "GET",
    path: "query",
    query: { query: `select Id, DocNumber, SyncToken from Bill where DocNumber = '${escaped}'` },
  });

  const hit = found.QueryResponse.Bill?.[0];
  if (!hit?.Id) return null;
  return { id: hit.Id, syncToken: hit.SyncToken ?? null };
}
