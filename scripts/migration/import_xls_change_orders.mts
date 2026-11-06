/**
 * Import Buildertrend ChangeOrders.xls export into WCI as FLAT COs (org-wide).
 *
 * Source of truth when Damien provides an XLS: every row/job in the file
 * (PRE_SALE / OPEN / CLOSED), not only the OPEN grid harvest.
 *
 * Idempotency: notesBuilder contains `xlsCoKey:<jobId>:<coId>:<titleSlug>`
 * and/or existing match by title+price on the same job (skips).
 *
 *   DATABASE_URL=… npx tsx scripts/migration/import_xls_change_orders.mts \
 *     --source /path/to/xls-cos.json --matches /path/to/xls-job-matches.json \
 *     [--dry-run] [--fix-amounts]
 */
import "dotenv/config";
import { readFileSync, writeFileSync } from "fs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../src/generated/prisma/client";
import {
  approveChangeOrder,
  declineChangeOrder,
  markChangeOrderSent,
} from "../../src/lib/change-orders/service";
/**
 * Historical XLS rows include PRE_SALE / CLOSED jobs. createChangeOrder()
 * correctly refuses those for live staff/API use (acceptsNewCommitments).
 * This migration writes FLAT DRAFT rows via Prisma, then uses the normal
 * mark/approve/decline services for status — amounts still come only from XLS.
 */

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("DATABASE_URL required");
  process.exit(1);
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

type XlsRow = {
  job: string;
  coId: string;
  title: string;
  builderCost: number;
  totalPrice: number;
  statusCat: string;
  statusRaw: string;
  statusChange?: string | null;
  client?: string;
};

type JobMatch = {
  xlsJob: string;
  wciId: string | null;
  wciName: string | null;
  wciStatus: string | null;
  how: string;
};

function parseArgs(argv: string[]) {
  const out: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const t = argv[i]!;
    if (!t.startsWith("--")) continue;
    const k = t.slice(2);
    const n = argv[i + 1];
    if (!n || n.startsWith("--")) out[k] = "true";
    else {
      out[k] = n;
      i++;
    }
  }
  return out;
}

function norm(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function titleSlug(s: string) {
  return norm(s).replace(/\s+/g, "-").slice(0, 80) || "untitled";
}

function xlsKey(jobId: string, coId: string, title: string) {
  return `xlsCoKey:${jobId}:${coId}:${titleSlug(title)}`;
}

function dollarsToCents(n: number): number {
  return Math.round((n ?? 0) * 100);
}

function mapStatus(cat: string, raw: string): "DRAFT" | "PENDING_APPROVAL" | "APPROVED" | "DECLINED" {
  if (cat === "Approved") return "APPROVED";
  if (cat === "Not sent") return "DRAFT";
  if (cat === "Sent / Pending") return "PENDING_APPROVAL";
  if (cat === "Declined" || cat === "Recalled") return "DECLINED";
  if (/past due/i.test(raw)) return "PENDING_APPROVAL";
  return "DRAFT";
}

type Result = {
  job: string;
  wciId: string;
  coId: string;
  title: string;
  statusCat: string;
  action: "created" | "skipped" | "fixed" | "error";
  wciCoId?: string;
  wciStatus?: string;
  flatCostCents?: number;
  flatClientPriceCents?: number;
  error?: string;
};

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const source = args.source;
  const matchesPath = args.matches;
  if (!source || !matchesPath) {
    console.error("Usage: --source xls-cos.json --matches xls-job-matches.json [--dry-run] [--fix-amounts] [--out path]");
    process.exit(1);
  }
  const dryRun = args["dry-run"] === "true";
  const fixAmounts = args["fix-amounts"] === "true";
  const outPath = args.out ?? "/tmp/xls-co-import-results.json";

  const rows = JSON.parse(readFileSync(source, "utf8")) as XlsRow[];
  const matches = JSON.parse(readFileSync(matchesPath, "utf8")) as JobMatch[];
  const byXlsJob = new Map(matches.map((m) => [m.xlsJob, m]));

  const org = await prisma.organization.findFirst({ select: { id: true } });
  if (!org) throw new Error("No organization");

  const flatRate = await prisma.costCode.findFirst({
    where: { organizationId: org.id, code: "BUILDERTREND-DEFAULT-BUILDERTREND-FLAT-RATE" },
    select: { id: true },
  });
  const creditCode = await prisma.costCode.findFirst({
    where: { organizationId: org.id, code: "BT-CREDIT" },
    select: { id: true },
  });
  if (!flatRate) throw new Error("Missing FLAT-RATE cost code");

  const results: Result[] = [];
  let created = 0;
  let skipped = 0;
  let fixed = 0;
  let errors = 0;

  // Cache existing COs per job
  const existingByJob = new Map<
    string,
    Array<{ id: string; title: string; status: string; flatCostCents: number | null; flatClientPriceCents: number | null; notesBuilder: string | null; number: number }>
  >();

  async function loadExisting(jobId: string) {
    if (existingByJob.has(jobId)) return existingByJob.get(jobId)!;
    const list = await prisma.changeOrder.findMany({
      where: { jobId },
      select: {
        id: true,
        title: true,
        status: true,
        flatCostCents: true,
        flatClientPriceCents: true,
        notesBuilder: true,
        number: true,
      },
    });
    existingByJob.set(jobId, list);
    return list;
  }

  for (const row of rows) {
    const jm = byXlsJob.get(row.job);
    if (!jm?.wciId) {
      errors++;
      results.push({
        job: row.job,
        wciId: "",
        coId: row.coId,
        title: row.title,
        statusCat: row.statusCat,
        action: "error",
        error: "JOB_UNMATCHED",
      });
      continue;
    }

    const costCents = dollarsToCents(row.builderCost);
    const priceCents = dollarsToCents(row.totalPrice);
    const costCodeId = priceCents < 0 && creditCode ? creditCode.id : flatRate.id;
    const targetStatus = mapStatus(row.statusCat, row.statusRaw);
    const key = xlsKey(jm.wciId, row.coId, row.title);
    const existing = await loadExisting(jm.wciId);

    const byKey = existing.find((c) => c.notesBuilder?.includes(key));
    const byTitlePrice = existing.find(
      (c) => norm(c.title) === norm(row.title) && c.flatClientPriceCents === priceCents,
    );
    const byTitle = existing.find((c) => norm(c.title) === norm(row.title));
    const hit = byKey ?? byTitlePrice ?? byTitle;

    if (hit) {
      const needsAmountFix =
        fixAmounts &&
        (hit.flatClientPriceCents !== priceCents || hit.flatCostCents !== costCents) &&
        (hit.status === "DRAFT" || hit.status === "PENDING_APPROVAL");

      if (needsAmountFix) {
        if (dryRun) {
          fixed++;
          results.push({
            job: row.job,
            wciId: jm.wciId,
            coId: row.coId,
            title: row.title,
            statusCat: row.statusCat,
            action: "fixed",
            wciCoId: hit.id,
            wciStatus: hit.status,
            flatCostCents: costCents,
            flatClientPriceCents: priceCents,
          });
          console.log(`DRY-FIX ${row.job} / ${row.title} ${hit.flatClientPriceCents}→${priceCents}`);
          continue;
        }
        await prisma.changeOrder.update({
          where: { id: hit.id },
          data: {
            flatCostCents: costCents,
            flatClientPriceCents: priceCents,
            flatCostCodeId: costCodeId,
            notesBuilder: [hit.notesBuilder, key, `xlsStatus:${row.statusRaw}`, "amountFixedFrom:ChangeOrders_Damien_2026-10-31.xls"]
              .filter(Boolean)
              .join("\n"),
          },
        });
        // refresh cache
        existingByJob.delete(jm.wciId);
        fixed++;
        results.push({
          job: row.job,
          wciId: jm.wciId,
          coId: row.coId,
          title: row.title,
          statusCat: row.statusCat,
          action: "fixed",
          wciCoId: hit.id,
          wciStatus: hit.status,
          flatCostCents: costCents,
          flatClientPriceCents: priceCents,
        });
        console.log(`FIX ${row.job} / ${row.title} → cost=${costCents} price=${priceCents}`);
        continue;
      }

      skipped++;
      results.push({
        job: row.job,
        wciId: jm.wciId,
        coId: row.coId,
        title: row.title,
        statusCat: row.statusCat,
        action: "skipped",
        wciCoId: hit.id,
        wciStatus: hit.status,
        flatCostCents: hit.flatCostCents ?? undefined,
        flatClientPriceCents: hit.flatClientPriceCents ?? undefined,
      });
      continue;
    }

    if (dryRun) {
      created++;
      results.push({
        job: row.job,
        wciId: jm.wciId,
        coId: row.coId,
        title: row.title,
        statusCat: row.statusCat,
        action: "created",
        flatCostCents: costCents,
        flatClientPriceCents: priceCents,
      });
      console.log(`DRY ${jm.wciStatus} ${row.job} / ${row.title} ${targetStatus} $${row.totalPrice}`);
      continue;
    }

    try {
      const notesBuilder = [
        key,
        `xlsCoId:${row.coId}`,
        `xlsStatus:${row.statusRaw}`,
        `xlsStatusCat:${row.statusCat}`,
        row.statusChange ? `xlsStatusChanged:${row.statusChange}` : null,
        row.client ? `xlsClient:${row.client}` : null,
        "importedFrom:ChangeOrders_Damien_2026-10-31.xls (FLAT; line items not in XLS)",
      ]
        .filter(Boolean)
        .join("\n");

      const last = await prisma.changeOrder.findFirst({
        where: { jobId: jm.wciId },
        orderBy: { number: "desc" },
        select: { number: true },
      });
      const number = (last?.number ?? 0) + 1;

      const createdCo = await prisma.changeOrder.create({
        data: {
          organizationId: org.id,
          jobId: jm.wciId,
          number,
          title: row.title || `BT CO ${row.coId}`,
          mode: "FLAT",
          flatCostCodeId: costCodeId,
          flatCostCents: costCents,
          flatClientPriceCents: priceCents,
          notesBuilder,
          status: "DRAFT",
          statusChangedAt: new Date(),
        },
      });

      let finalStatus = createdCo.status;
      if (targetStatus === "APPROVED") {
        const approved = await approveChangeOrder({
          organizationId: org.id,
          changeOrderId: createdCo.id,
          clientSignatureName: row.client || undefined,
        });
        finalStatus = approved.changeOrder.status;
        if (row.statusChange) {
          const d = new Date(row.statusChange);
          if (!Number.isNaN(d.getTime())) {
            await prisma.changeOrder.update({
              where: { id: createdCo.id },
              data: { approvedAt: d, statusChangedAt: d, clientSignedAt: d },
            });
          }
        }
      } else if (targetStatus === "PENDING_APPROVAL") {
        const sent = await markChangeOrderSent(org.id, createdCo.id);
        finalStatus = sent.status;
      } else if (targetStatus === "DECLINED") {
        const declined = await declineChangeOrder(org.id, createdCo.id);
        finalStatus = declined.status;
      }

      existingByJob.delete(jm.wciId);
      created++;
      results.push({
        job: row.job,
        wciId: jm.wciId,
        coId: row.coId,
        title: row.title,
        statusCat: row.statusCat,
        action: "created",
        wciCoId: createdCo.id,
        wciStatus: finalStatus,
        flatCostCents: costCents,
        flatClientPriceCents: priceCents,
      });
      console.log(`OK ${jm.wciStatus} ${row.job} / ${row.title} → ${finalStatus}`);
    } catch (e) {
      errors++;
      const error = e instanceof Error ? e.message : String(e);
      results.push({
        job: row.job,
        wciId: jm.wciId,
        coId: row.coId,
        title: row.title,
        statusCat: row.statusCat,
        action: "error",
        flatCostCents: costCents,
        flatClientPriceCents: priceCents,
        error,
      });
      console.error(`ERR ${row.job} / ${row.title}: ${error}`);
    }
  }

  const summary = {
    dryRun,
    created,
    skipped,
    fixed,
    errors,
    total: results.length,
    at: new Date().toISOString(),
  };
  writeFileSync(outPath, JSON.stringify({ summary, results }, null, 2));
  console.log(JSON.stringify(summary, null, 2));
  console.log(`Wrote ${outPath}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
