/**
 * Lien waivers, tracked per bill.
 *
 * A GC needs a signed waiver from every sub they pay, or the sub can still lien the
 * property after being paid. This is deliberately v1-simple: fill a static template
 * with the bill's own facts and mark it released when it goes out. The value is the
 * record and the compliance trail — who waived what, for how much, on which job,
 * when — not generating a legally-reviewed instrument. Anything that needs a lawyer's
 * template can replace TEMPLATES without touching the rest.
 */

import { db } from "@/lib/db";
import { formatMoney } from "@/lib/format";
import { BillNotFoundError } from "@/lib/bills/service";

export class LienWaiverNotFoundError extends Error {
  constructor(id: string) {
    super(`No lien waiver ${id} in this organization.`);
    this.name = "LienWaiverNotFoundError";
  }
}

export class LienWaiverAlreadyReleasedError extends Error {
  constructor(id: string) {
    super(`Lien waiver ${id} is already released and can't be edited.`);
    this.name = "LienWaiverAlreadyReleasedError";
  }
}

export interface LienWaiverFacts {
  readonly vendorName: string;
  readonly jobName: string;
  readonly jobAddress: string | null;
  readonly amountCents: number;
  readonly billNumber: string | null;
  readonly throughDate: Date;
}

/**
 * The waiver bodies. Conditional is the safe default — it only takes effect once the
 * payment actually clears, so it can be sent with the check rather than after it.
 */
export const TEMPLATES: Readonly<Record<string, (facts: LienWaiverFacts) => string>> = {
  "Standard Lien Waiver": (facts) =>
    [
      "CONDITIONAL WAIVER AND RELEASE UPON PROGRESS PAYMENT",
      "",
      `Claimant: ${facts.vendorName}`,
      `Project: ${facts.jobName}${facts.jobAddress ? `, ${facts.jobAddress}` : ""}`,
      `Through date: ${facts.throughDate.toISOString().slice(0, 10)}`,
      facts.billNumber ? `Invoice reference: ${facts.billNumber}` : "",
      `Payment amount: ${formatMoney(facts.amountCents)}`,
      "",
      "Upon receipt by the claimant of a check payable to the claimant in the amount",
      "stated above, and when the check has been properly endorsed and has been paid by",
      "the bank on which it is drawn, this document becomes effective to release any",
      "mechanic's lien, stop payment notice, or payment bond right the claimant has on",
      "the project through the through date stated above, to the extent of the payment",
      "amount stated above.",
      "",
      "This release covers a progress payment only. It does not cover retention,",
      "pending modifications, or items furnished after the through date.",
      "",
      "Claimant signature: ______________________________",
      "Printed name: ____________________________________",
      "Date: ____________________________________________",
    ]
      .filter((line) => line !== "")
      .join("\n"),
};

export const TEMPLATE_NAMES = Object.keys(TEMPLATES);

/**
 * Create (or refresh) the waiver on a bill from the current template. Refreshing a
 * released waiver is refused: what went out is the record, and changing it after the
 * fact would defeat the point of keeping one.
 */
export async function applyLienWaiver(input: {
  readonly organizationId: string;
  readonly billId: string;
  readonly templateName: string;
}) {
  const template = TEMPLATES[input.templateName];
  if (!template) throw new Error(`Unknown lien waiver template "${input.templateName}".`);

  const bill = await db.bill.findFirst({
    where: { id: input.billId, organizationId: input.organizationId },
    include: {
      lineItems: { select: { amountCents: true } },
      job: { select: { name: true, addressLine1: true, city: true, state: true } },
      lienWaivers: true,
    },
  });
  if (!bill) throw new BillNotFoundError(input.billId);

  const existing = bill.lienWaivers[0];
  if (existing && existing.status === "RELEASED") throw new LienWaiverAlreadyReleasedError(existing.id);

  const body = template({
    vendorName: bill.vendorName,
    jobName: bill.job.name,
    jobAddress: [bill.job.addressLine1, bill.job.city, bill.job.state].filter(Boolean).join(", ") || null,
    amountCents: bill.lineItems.reduce((total, item) => total + item.amountCents, 0),
    billNumber: bill.billNumber,
    throughDate: bill.issuedOn ?? bill.createdAt,
  });

  if (existing) {
    return db.lienWaiver.update({
      where: { id: existing.id },
      data: { templateName: input.templateName, body },
    });
  }

  return db.lienWaiver.create({
    data: {
      organizationId: input.organizationId,
      billId: bill.id,
      templateName: input.templateName,
      body,
    },
  });
}

/** Mark a waiver released — sent to, or signed by, the vendor. Terminal. */
export async function releaseLienWaiver(input: { readonly organizationId: string; readonly lienWaiverId: string }) {
  const waiver = await db.lienWaiver.findFirst({
    where: { id: input.lienWaiverId, organizationId: input.organizationId },
    select: { id: true, status: true },
  });
  if (!waiver) throw new LienWaiverNotFoundError(input.lienWaiverId);
  if (waiver.status === "RELEASED") return waiver;

  return db.lienWaiver.update({
    where: { id: waiver.id },
    data: { status: "RELEASED", releasedAt: new Date() },
  });
}
