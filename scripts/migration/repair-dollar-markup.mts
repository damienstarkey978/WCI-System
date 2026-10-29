import { createRequire } from "module";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../src/generated/prisma/client";
import { PaymentMethod, RateMode } from "../../src/generated/prisma/enums";
import { readFileSync, readdirSync, existsSync } from "fs";
import { join } from "path";
import { rollUpEstimateLines } from "../../src/lib/budget/send-to-budget";
import { recordPayment } from "../../src/lib/invoicing/service";

const require = createRequire(import.meta.url);
const XLSX = require("xlsx") as typeof import("xlsx");

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

const PROPOSALS = "/cursor/stores/self/docs/bt-exports/proposals";
const JOB_MAP = JSON.parse(
  readFileSync("/cursor/stores/self/docs/bt-exports/bt-to-wci-job-map.json", "utf8"),
) as { btName: string; wciId: string | null; slug?: string }[];

function readXls(path: string) {
  const wb = XLSX.read(readFileSync(path), { type: "buffer" });
  return XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: "" }) as Record<
    string,
    unknown
  >[];
}

function xlsTotals(rows: Record<string, unknown>[]) {
  let client = 0;
  let builder = 0;
  let dollarMarkupRows = 0;
  let percentMarkupRows = 0;
  let emptyType = 0;
  for (const r of rows) {
    const title = String(r["Title"] ?? "").trim();
    const code = String(r["Cost Code"] ?? "").trim();
    if (!title || !code) continue;
    client += Number(r["Client Price"] || 0);
    builder += Number(r["Builder Cost"] || 0);
    const mt = String(r["Markup Type"] ?? "").trim();
    if (mt === "$") dollarMarkupRows++;
    else if (mt.includes("%")) percentMarkupRows++;
    else emptyType++;
  }
  return {
    clientCents: Math.round(client * 100),
    builderCents: Math.round(builder * 100),
    dollarMarkupRows,
    percentMarkupRows,
    emptyType,
  };
}

/** Convert BT line to correct markup bps. Prefer Client Price when present. */
function correctBps(row: Record<string, unknown>): number {
  const builder = Number(row["Builder Cost"] || 0);
  const client = Number(row["Client Price"] || 0);
  const markup = Number(row["Markup"] || 0);
  const mt = String(row["Markup Type"] ?? "").trim();
  if (builder > 0 && client > 0) {
    return Math.round((client / builder - 1) * 10000);
  }
  if (mt === "$" && builder > 0) {
    return Math.round((markup / builder) * 10000);
  }
  // percent: Markup is already a percent number like 21
  return Math.round(markup * 100);
}

function matchKey(title: string, costCode: string, qty: number, unitCostCents: number) {
  return `${costCode}||${title}||${qty}||${unitCostCents}`;
}

type XlsTotals = ReturnType<typeof xlsTotals>;

type ScanFinding = XlsTotals & {
  folder: string;
  wciId: string | null | undefined;
  estimateId: string | null;
  wciPrice: number | null;
  wciCost: number | null;
  ratio: number | null;
  inflated: boolean;
};

type RepairResult = Awaited<ReturnType<typeof repairJob>> & { folder: string };

async function scanAll() {
  const findings: ScanFinding[] = [];
  for (const folder of readdirSync(PROPOSALS)) {
    const xls = join(PROPOSALS, folder, "ProposalReport.xls");
    if (!existsSync(xls)) continue;
    const rows = readXls(xls);
    const tot = xlsTotals(rows);
    // Match by folder name against map btName slugified
    const slug = folder;
    const mapped = JOB_MAP.find((j) => {
      const s = (j.btName || "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "")
        .slice(0, 80);
      return s === slug || slug.startsWith(s.slice(0, 30));
    });
    const wciId = mapped?.wciId;
    let wciPrice: number | null = null;
    let wciCost: number | null = null;
    let estimateId: string | null = null;
    if (wciId) {
      const agg = await prisma.budgetLine.aggregate({
        where: { jobId: wciId },
        _sum: { revisedClientPriceCents: true, revisedBudgetCostCents: true },
      });
      wciPrice = agg._sum.revisedClientPriceCents ?? 0;
      wciCost = agg._sum.revisedBudgetCostCents ?? 0;
      const est = await prisma.estimate.findFirst({
        where: { jobId: wciId, aiPromptNotes: { startsWith: "bt-proposal:" } },
        select: { id: true },
      });
      estimateId = est?.id ?? null;
    }
    const ratio =
      tot.clientCents > 0 && wciPrice && wciPrice > 0 ? wciPrice / tot.clientCents : null;
    const inflated =
      tot.dollarMarkupRows > 0 &&
      wciPrice != null &&
      tot.clientCents > 0 &&
      Math.abs(wciPrice - tot.clientCents) > 100 &&
      (wciPrice as number) > tot.clientCents * 1.5;
    findings.push({
      folder,
      wciId,
      estimateId,
      ...tot,
      wciPrice,
      wciCost,
      ratio: ratio ? Math.round(ratio * 100) / 100 : null,
      inflated,
    });
  }
  return findings;
}

async function repairJob(folder: string, wciId: string, estimateId: string, dryRun = false) {
  const xls = join(PROPOSALS, folder, "ProposalReport.xls");
  const rows = readXls(xls).filter(
    (r) => String(r["Title"] ?? "").trim() && String(r["Cost Code"] ?? "").trim(),
  );
  const tot = xlsTotals(rows);

  const before = await prisma.budgetLine.aggregate({
    where: { jobId: wciId },
    _sum: {
      revisedClientPriceCents: true,
      originalClientPriceCents: true,
      revisedBudgetCostCents: true,
    },
  });

  const estimate = await prisma.estimate.findFirst({
    where: { id: estimateId },
    include: { lineItems: { orderBy: { sortOrder: "asc" } } },
  });
  if (!estimate) throw new Error(`estimate ${estimateId} missing`);

  // Build multiset of XLS rows keyed for matching
  const xlsByKey = new Map<string, Record<string, unknown>[]>();
  for (const r of rows) {
    const qtyMilli = Math.round(Number(r["Quantity"] || 0) * 1000);
    const unitCostCents = Math.round(Number(r["Unit Cost"] || r["Builder Cost"] || 0) * 100);
    const key = matchKey(String(r["Title"]).trim(), String(r["Cost Code"]).trim(), qtyMilli, unitCostCents);
    const arr = xlsByKey.get(key) || [];
    arr.push(r);
    xlsByKey.set(key, arr);
  }

  // Also index cost codes by name for line matching via title+qty+unit only
  const costCodes = await prisma.costCode.findMany({
    where: { organizationId: estimate.organizationId },
    select: { id: true, name: true },
  });
  const codeNameById = new Map(costCodes.map((c) => [c.id, c.name]));

  const updates: { id: string; from: number; to: number; title: string }[] = [];
  for (const li of estimate.lineItems) {
    const codeName = codeNameById.get(li.costCodeId) || "";
    const key = matchKey(li.title, codeName, li.quantityMilli, li.unitCostCents);
    let row = (xlsByKey.get(key) || []).shift();
    if (!row) {
      // fallback: title + qty only
      row = rows.find(
        (r) =>
          String(r["Title"]).trim() === li.title &&
          Math.round(Number(r["Quantity"] || 0) * 1000) === li.quantityMilli,
      );
    }
    if (!row) {
      console.log("  NO MATCH line", li.title.slice(0, 40), li.rateBasisPoints);
      continue;
    }
    const to = correctBps(row);
    if (li.rateBasisPoints !== to) {
      updates.push({ id: li.id, from: li.rateBasisPoints, to, title: li.title.slice(0, 40) });
    }
  }

  console.log(
    `REPAIR ${folder}: ${updates.length}/${estimate.lineItems.length} lines need bps fix; XLS client=${tot.clientCents} beforeWci=${before._sum.revisedClientPriceCents}`,
  );
  console.log("  sample fixes", updates.slice(0, 3));

  if (dryRun) {
    return { before, tot, updates: updates.length };
  }

  for (const u of updates) {
    await prisma.estimateLineItem.update({
      where: { id: u.id },
      data: { rateBasisPoints: u.to },
    });
  }

  const refreshed = await prisma.estimate.findFirstOrThrow({
    where: { id: estimateId },
    include: { lineItems: true },
  });
  const rollups = rollUpEstimateLines(refreshed.lineItems);
  let totalPrice = 0;
  let totalCost = 0;
  for (const r of rollups) {
    totalPrice += r.clientPriceCents;
    totalCost += r.costCents;
    await prisma.budgetLine.updateMany({
      where: { jobId: wciId, costCodeId: r.costCodeId },
      data: {
        // Migration repair of bad first write — fix originals too
        originalBudgetCostCents: r.costCents,
        revisedBudgetCostCents: r.costCents,
        originalClientPriceCents: r.clientPriceCents,
        revisedClientPriceCents: r.clientPriceCents,
        rateMode: RateMode.MARKUP,
        rateBasisPoints: r.blendedMarkupBasisPoints,
      },
    });
  }

  const after = await prisma.budgetLine.aggregate({
    where: { jobId: wciId },
    _sum: {
      revisedClientPriceCents: true,
      originalClientPriceCents: true,
      revisedBudgetCostCents: true,
    },
  });

  console.log("  AFTER budget", after._sum, "rollup totals", { totalCost, totalPrice }, "xls", tot.clientCents);
  return { before, after, tot, updates: updates.length, totalPrice, totalCost };
}

async function ensureCandlebarkPayment(orgId: string, jobId: string) {
  const inv = await prisma.invoice.findFirst({
    where: { jobId, invoiceNumber: "932-1" },
    include: { payments: true },
  });
  if (!inv) throw new Error("invoice 932-1 not found");
  const paid = inv.payments.reduce((s, p) => s + p.amountCents, 0);
  const need = 1688615; // $16,886.15
  console.log("INV 932-1 before", {
    status: inv.status,
    amount: inv.amountCents,
    paid,
    n: inv.payments.length,
  });
  if (paid >= need) {
    console.log("  payment already present");
    return { created: false, paid };
  }
  const remaining = need - paid;
  const result = await recordPayment({
    organizationId: orgId,
    invoiceId: inv.id,
    method: PaymentMethod.QBO_SYNC,
    amountCents: remaining,
    reference: "BT InvoicePayments 0001 QB Paid",
    receivedAt: new Date("2026-10-05T04:00:00.000Z"),
  });
  console.log("  payment created", {
    paymentId: result.payment.id,
    status: result.invoice.status,
    remainingCents: result.remainingCents,
  });
  return { created: true, paid: paid + remaining, paymentId: result.payment.id };
}

async function main() {
  const org = await prisma.organization.findFirstOrThrow();
  console.log("=== SCAN ===");
  const findings = await scanAll();
  for (const f of findings) {
    const flag = f.inflated ? "INFLATED" : f.dollarMarkupRows ? "$-markup" : "%/other";
    console.log(
      `${flag.padEnd(10)} ${f.folder.slice(0, 45).padEnd(46)} xls=${f.clientCents} wci=${f.wciPrice} ratio=${f.ratio} $rows=${f.dollarMarkupRows}`,
    );
  }

  const inflated = findings.filter((f) => f.inflated && f.wciId && f.estimateId);
  console.log("\nInflated jobs to repair:", inflated.map((f) => f.folder));

  const results: RepairResult[] = [];
  for (const f of inflated) {
    const r = await repairJob(f.folder, f.wciId!, f.estimateId!, false);
    results.push({ folder: f.folder, ...r });
  }

  // Always ensure Candlebark payment even if scan missed
  const candle = findings.find((f) => f.folder.includes("candlebark"));
  if (candle?.wciId) {
    console.log("\n=== PAYMENT ===");
    await ensureCandlebarkPayment(org.id, candle.wciId);
  }

  // Final verify Candlebark
  if (candle?.wciId) {
    const after = await prisma.budgetLine.aggregate({
      where: { jobId: candle.wciId },
      _sum: { revisedClientPriceCents: true, originalClientPriceCents: true, revisedBudgetCostCents: true },
    });
    const inv = await prisma.invoice.findFirst({
      where: { jobId: candle.wciId, invoiceNumber: "932-1" },
      include: { payments: true },
    });
    console.log("\n=== CANDLEBARK FINAL ===");
    console.log("budget", after._sum);
    console.log("invoice", {
      status: inv?.status,
      amount: inv?.amountCents,
      paid: inv?.payments.reduce((s, p) => s + p.amountCents, 0),
    });
  }

  console.log("\nDONE", JSON.stringify({ inflated: inflated.length, results: results.map(r => ({
    folder: r.folder,
    before: r.before?._sum,
    after: r.after?._sum,
    xls: r.tot?.clientCents,
    linesFixed: r.updates,
  }))}, null, 2));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
