/**
 * Attach BT InvoicePayments onto existing WCI invoices for OPEN jobs, and void
 * unpaid prefix-variant duplicates that already have a paid sibling.
 *
 * Root cause of missing payments: InvoicePayments.csv uses zero-padded Invoice
 * ids ("0001") while Invoices.csv ID# is unpadded ("1"), so import_financials
 * never attached payments. Re-import alone also fails when Job.prefix is null
 * and existing rows use JOB_XXXX / JNNN-INV prefixes.
 *
 *   DATABASE_URL=… npx tsx scripts/migration/backfill-bt-invoice-payments.mts \
 *     [--payments path] [--invoices path] [--dry-run]
 *
 * Never invents amounts/dates — only BT export rows. Never grants ClientJobAccess.
 */
import "dotenv/config";
import { readFileSync } from "node:fs";
import { PrismaPg } from "@prisma/adapter-pg";
import { InvoiceStatus, PaymentMethod } from "../../src/generated/prisma/enums";
import { PrismaClient } from "../../src/generated/prisma/client";

function parseArgs(argv: readonly string[]): Record<string, string> {
  const args: Record<string, string> = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith("--")) continue;
    const key = token.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith("--")) args[key] = "true";
    else {
      args[key] = next;
      i += 1;
    }
  }
  return args;
}

function normalizeJobName(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLowerCase();
}

/** Keys so "0001" matches "1", "0130" matches "130"; leave "0132 Draw 2" intact. */
function invoiceIdKeys(raw: string): string[] {
  const s = String(raw ?? "").trim();
  if (!s) return [];
  const keys = new Set<string>([s, s.toLowerCase()]);
  if (/^\d+$/.test(s)) {
    keys.add(String(parseInt(s, 10)));
  }
  // Strip a leading zero-padded numeric prefix when followed by a space/label.
  const labeled = s.match(/^0*(\d+)(\s+.+)$/);
  if (labeled) {
    keys.add(`${labeled[1]}${labeled[2]}`);
    keys.add(s.replace(/^0+/, "") || s);
  }
  return [...keys];
}

function invoiceNumberSuffix(invoiceNumber: string): string {
  // JOB_5BBC-1 → 1; J026-INV-0002 → 0002; 0132 Draw 2 → 0132 Draw 2 (no hyphen family)
  const inv = invoiceNumber.trim();
  const jInv = inv.match(/^J\d+-INV-(.+)$/i);
  if (jInv) return jInv[1];
  const job = inv.match(/^JOB_[A-Z0-9]+-(.+)$/i);
  if (job) return job[1];
  const street = inv.match(/^\d+-(.+)$/);
  if (street) return street[1];
  // Bare "0001 - title" drafts — take leading token
  const bare = inv.match(/^(\d+)\b/);
  if (bare) return bare[1];
  const dash = inv.indexOf("-");
  if (dash > 0) return inv.slice(dash + 1);
  return inv;
}

/** Stable BT invoice id for grouping prefix variants (0001 and 1 → "1"). */
function canonicalBtId(raw: string): string {
  const keys = invoiceIdKeys(raw);
  const digits = keys.filter((k) => /^\d+$/.test(k));
  if (digits.length > 0) return String(parseInt(digits[0], 10));
  // Prefer the shortest non-empty key (strips leading zeros on labeled ids when present)
  return keys.sort((a, b) => a.length - b.length)[0] ?? raw.trim();
}

function isFullyPaid(inv: {
  status: InvoiceStatus;
  amountCents: number;
  payments: readonly { amountCents: number }[];
}): boolean {
  if (inv.status === InvoiceStatus.PAID) return true;
  const paid = inv.payments.reduce((s, p) => s + p.amountCents, 0);
  return paid >= inv.amountCents && inv.amountCents > 0;
}

function mapPaymentMethod(raw: string): PaymentMethod {
  const v = (raw || "").trim();
  if (v === "QuickBooks") return PaymentMethod.QBO_SYNC;
  if (v === "Stripe" || v === "Credit Card" || v === "Online Payment") {
    return PaymentMethod.STRIPE_CARD;
  }
  return PaymentMethod.MANUAL;
}

function parseCsvDate(raw: string): Date | null {
  const text = (raw || "").trim();
  if (!text || text === "-" || text === "N/A") return null;
  // "2026-05-01 15:14:02" or "2026-05-01 00:00:00"
  if (/^\d{4}-\d{2}-\d{2}/.test(text)) {
    const iso = text.length >= 19 ? `${text.slice(0, 10)}T${text.slice(11, 19)}Z` : `${text.slice(0, 10)}T00:00:00Z`;
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(text);
  return Number.isNaN(d.getTime()) ? null : d;
}

function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i += 1;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}

function readCsv(path: string): Record<string, string>[] {
  const text = readFileSync(path, "utf8").replace(/^\uFEFF/, "");
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) return [];
  const headers = parseCsvLine(lines[0]).map((h) => h.trim());
  return lines.slice(1).map((line) => {
    const cols = parseCsvLine(line);
    const row: Record<string, string> = {};
    for (let i = 0; i < headers.length; i += 1) {
      row[headers[i]] = (cols[i] ?? "").trim();
    }
    return row;
  });
}

type PayRow = {
  jobKey: string;
  jobRaw: string;
  invoiceRaw: string;
  amountCents: number;
  receivedAt: Date;
  method: PaymentMethod;
};

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const dryRun = args["dry-run"] === "true";
  const paymentsPath =
    args.payments ??
    "/cursor/stores/self/docs/bt-exports/InvoicePayments.csv";
  const invoicesPath =
    args.invoices ?? "/cursor/stores/self/docs/bt-exports/Invoices.csv";

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error("DATABASE_URL is not set.");
    process.exit(1);
  }
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
  const org = await db.organization.findFirstOrThrow({
    where: { slug: args.org ?? "world-construction" },
  });

  const payCsv = readCsv(paymentsPath);
  const invCsv = readCsv(invoicesPath);

  const payments: PayRow[] = [];
  for (const row of payCsv) {
    const jobRaw = row.Job ?? "";
    const invoiceRaw = (row.Invoice ?? row["Invoice #"] ?? "").trim();
    const amount = Number(row["Payment amount"] ?? row["Payment Amount"] ?? 0);
    const receivedAt = parseCsvDate(row["Date paid"] ?? row["Date Paid"] ?? "");
    if (!invoiceRaw || !receivedAt || !Number.isFinite(amount) || amount <= 0) continue;
    payments.push({
      jobKey: normalizeJobName(jobRaw),
      jobRaw,
      invoiceRaw,
      amountCents: Math.round(amount * 100),
      receivedAt,
      method: mapPaymentMethod(row["Payment method"] ?? row["Payment Method"] ?? ""),
    });
  }

  // BT paid invoice ids by job (for voiding unpaid drafts that aren't in payments)
  const btPaidByJob = new Map<string, Set<string>>();
  for (const row of invCsv) {
    const jobKey = normalizeJobName(row.Job ?? "");
    const id = String(row["ID#"] ?? "").trim();
    const amountPaid = Number(row["Amount Paid"] ?? 0);
    const status = (row.Status ?? "").trim().toLowerCase();
    if (!id || (!amountPaid && status !== "paid")) continue;
    const set = btPaidByJob.get(jobKey) ?? new Set<string>();
    for (const k of invoiceIdKeys(id)) set.add(k);
    btPaidByJob.set(jobKey, set);
  }

  const openJobs = await db.job.findMany({
    where: { organizationId: org.id, status: "OPEN" },
    select: { id: true, name: true, prefix: true },
  });
  const jobByKey = new Map(openJobs.map((j) => [normalizeJobName(j.name), j]));

  let attached = 0;
  let skippedAlreadyPaid = 0;
  let skippedNoInvoice = 0;
  let voidedDupes = 0;
  let statusUpdated = 0;
  const perJob: Record<string, { attached: number; voided: number; missing: string[] }> = {};

  // --- Phase 1: attach payments ---
  for (const pay of payments) {
    const job = jobByKey.get(pay.jobKey);
    if (!job) continue; // not an OPEN job we care about
    const stats = (perJob[job.name] ??= { attached: 0, voided: 0, missing: [] });

    const invs = await db.invoice.findMany({
      where: { jobId: job.id, status: { not: InvoiceStatus.VOID } },
      include: { payments: { select: { id: true, amountCents: true } } },
    });

    const payCanon = canonicalBtId(pay.invoiceRaw);
    const candidates = invs.filter(
      (inv) => canonicalBtId(invoiceNumberSuffix(inv.invoiceNumber)) === payCanon,
    );

    if (candidates.length === 0) {
      skippedNoInvoice += 1;
      stats.missing.push(`${pay.invoiceRaw} $${(pay.amountCents / 100).toFixed(2)}`);
      console.log(`MISS ${job.name}: payment invoice=${pay.invoiceRaw} $${(pay.amountCents / 100).toFixed(2)}`);
      continue;
    }

    // If any prefix family already has this payment covered, do NOT attach again
    // onto an empty JOB_* / J* duplicate (that would double RECEIVED on the job).
    if (candidates.some((c) => isFullyPaid(c))) {
      skippedAlreadyPaid += 1;
      continue;
    }

    // Prefer exact amount match + empty payments among remaining candidates.
    const emptyExact = candidates.filter(
      (c) => c.payments.length === 0 && c.amountCents === pay.amountCents,
    );
    const emptyAny = candidates.filter((c) => c.payments.length === 0);
    // Prefer JOB_* then street-prefix then J*-INV for the surviving empty row.
    const rank = (n: string) =>
      n.startsWith("JOB_") ? 0 : /^\d+-/.test(n) ? 1 : n.includes("-INV-") ? 2 : 3;
    const target = [...emptyExact, ...emptyAny]
      .sort((a, b) => rank(a.invoiceNumber) - rank(b.invoiceNumber))[0];

    if (!target) {
      skippedAlreadyPaid += 1;
      continue;
    }

    const existingPaid = target.payments.reduce((s, p) => s + p.amountCents, 0);
    if (existingPaid + pay.amountCents > target.amountCents) {
      console.log(
        `SKIP overpay ${job.name} ${target.invoiceNumber}: have ${existingPaid} + ${pay.amountCents} > ${target.amountCents}`,
      );
      continue;
    }

    const nextPaid = existingPaid + pay.amountCents;
    const nextStatus =
      nextPaid >= target.amountCents
        ? InvoiceStatus.PAID
        : InvoiceStatus.PARTIALLY_PAID;

    console.log(
      `${dryRun ? "DRY " : ""}PAY ${job.name}: ${target.invoiceNumber} +$${(pay.amountCents / 100).toFixed(2)} on ${pay.receivedAt.toISOString().slice(0, 10)} → ${nextStatus}`,
    );

    if (!dryRun) {
      await db.$transaction(async (tx) => {
        await tx.payment.create({
          data: {
            organizationId: org.id,
            invoiceId: target.id,
            method: pay.method,
            amountCents: pay.amountCents,
            receivedAt: pay.receivedAt,
            createdAt: pay.receivedAt,
          },
        });
        await tx.invoice.update({
          where: { id: target.id },
          data: {
            status: nextStatus,
            paidAt:
              nextStatus === InvoiceStatus.PAID
                ? (target.paidAt ?? pay.receivedAt)
                : target.paidAt,
          },
        });
      });
    }
    attached += 1;
    stats.attached += 1;
    if (nextStatus === InvoiceStatus.PAID || nextStatus === InvoiceStatus.PARTIALLY_PAID) {
      statusUpdated += 1;
    }
  }

  // --- Phase 2: void unpaid duplicates when a paid sibling covers the same BT id ---
  for (const job of openJobs) {
    const invs = await db.invoice.findMany({
      where: { jobId: job.id },
      include: { payments: { select: { amountCents: true } } },
    });
    const byBtId = new Map<string, typeof invs>();
    for (const inv of invs) {
      if (inv.status === InvoiceStatus.VOID) continue;
      const canon = canonicalBtId(invoiceNumberSuffix(inv.invoiceNumber));
      if (!canon) continue;
      const list = byBtId.get(canon) ?? [];
      list.push(inv);
      byBtId.set(canon, list);
    }

    for (const [, group] of byBtId) {
      if (group.length < 2) continue;
      const paidOnes = group.filter((g) => isFullyPaid(g));
      if (paidOnes.length === 0) continue;
      for (const dup of group) {
        if (paidOnes.some((p) => p.id === dup.id)) continue;
        if (dup.payments.length > 0) continue;
        // Only void SENT/DRAFT unpaid clones that match a paid sibling's amount
        if (
          dup.status !== InvoiceStatus.SENT &&
          dup.status !== InvoiceStatus.DRAFT &&
          dup.status !== InvoiceStatus.PARTIALLY_PAID
        ) {
          continue;
        }
        const siblingAmtMatch = paidOnes.some((p) => p.amountCents === dup.amountCents);
        if (!siblingAmtMatch) continue;
        console.log(
          `${dryRun ? "DRY " : ""}VOID dup ${job.name}: ${dup.invoiceNumber} (paid sibling ${paidOnes[0].invoiceNumber})`,
        );
        if (!dryRun) {
          await db.invoice.update({
            where: { id: dup.id },
            data: { status: InvoiceStatus.VOID, voidedAt: new Date() },
          });
        }
        voidedDupes += 1;
        (perJob[job.name] ??= { attached: 0, voided: 0, missing: [] }).voided += 1;
      }
    }
  }

  console.log("\n=== SUMMARY ===");
  console.log({ attached, skippedAlreadyPaid, skippedNoInvoice, voidedDupes, statusUpdated, dryRun });
  console.log("\nPer job:");
  for (const [name, s] of Object.entries(perJob).sort(([a], [b]) => a.localeCompare(b))) {
    console.log(
      `  ${name}: attached=${s.attached} voided=${s.voided}` +
        (s.missing.length ? ` missing=[${s.missing.join("; ")}]` : ""),
    );
  }

  await db.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
