/**
 * Import Buildertrend Change Orders (grid export) into WCI as FLAT COs.
 *
 * BT line-item detail APIs (Update / CostCodeItems / GetChangeOrderLineItemIds)
 * do not return usable line payloads for this account, so each CO is imported
 * FLAT using grid builderCost → flatCostCents and totalWithTax → flatClientPriceCents.
 * Flat cost code defaults to BUILDERTREND-DEFAULT-BUILDERTREND-FLAT-RATE
 * (BT-CREDIT when client price is negative).
 *
 * Status mapping:
 *   Draft    → DRAFT
 *   Pending  → PENDING_APPROVAL (markChangeOrderSent)
 *   Approved → APPROVED via approveChangeOrder (budget revise path)
 *   Declined / Recalled → DECLINED
 *
 * Idempotency: notesBuilder contains `btChangeOrderId:<id>` — re-runs skip.
 *
 *   DATABASE_URL=… npx tsx scripts/migration/import_bt_change_orders.mts \
 *     --source /path/to/bt-cos-all-open.json [--dry-run] [--job-slug haslett]
 */
import "dotenv/config";
import { readFileSync, writeFileSync } from "fs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../src/generated/prisma/client";
import {
  approveChangeOrder,
  createChangeOrder,
  declineChangeOrder,
  markChangeOrderSent,
} from "../../src/lib/change-orders/service";
import type { Cents } from "../../src/lib/money";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("DATABASE_URL required");
  process.exit(1);
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

type BtMoney = { value: number; scale: number } | null | undefined;

type BtCo = {
  id: number;
  title: string;
  builderCost?: BtMoney;
  totalWithTax?: BtMoney;
  ownerPrice?: BtMoney;
  approvalStatus?: { approvalStatus?: number; message?: string; dateUpdated?: string; updatedBy?: string };
  rawStatus?: number;
  added?: string;
  deadline?: string | null;
};

type BtJobCos = {
  name: string;
  slug: string;
  btJobId: number;
  wciId: string;
  records: number;
  cos: BtCo[];
};

function parseArgs(argv: string[]) {
  const out: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const t = argv[i];
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

function moneyToCents(m: BtMoney): number {
  if (!m || typeof m.value !== "number") return 0;
  return Math.round(m.value * 100);
}

function btStatusMessage(co: BtCo): string {
  return (co.approvalStatus?.message ?? "").trim() || String(co.rawStatus ?? "");
}

function idempotencyTag(btCoId: number): string {
  return `btChangeOrderId:${btCoId}`;
}

type ImportResult = {
  job: string;
  wciId: string;
  btCoId: number;
  title: string;
  btStatus: string;
  action: "created" | "skipped" | "error";
  wciIdCo?: string;
  wciStatus?: string;
  flatCostCents?: number;
  flatClientPriceCents?: number;
  error?: string;
};

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const source = args.source;
  if (!source) {
    console.error("Usage: --source <bt-cos-all-open.json> [--dry-run] [--job-slug <substr>] [--out <json>]");
    process.exit(1);
  }
  const dryRun = args["dry-run"] === "true";
  const jobSlugFilter = (args["job-slug"] ?? "").toLowerCase();
  const outPath = args.out ?? "/tmp/bt-co-import-results.json";

  const jobs = JSON.parse(readFileSync(source, "utf8")) as BtJobCos[];
  const org = await prisma.organization.findFirst({ select: { id: true } });
  if (!org) throw new Error("No organization");

  const flatRate = await prisma.costCode.findFirst({
    where: { organizationId: org.id, code: "BUILDERTREND-DEFAULT-BUILDERTREND-FLAT-RATE" },
    select: { id: true, code: true },
  });
  const creditCode = await prisma.costCode.findFirst({
    where: { organizationId: org.id, code: "BT-CREDIT" },
    select: { id: true, code: true },
  });
  if (!flatRate) throw new Error("Missing cost code BUILDERTREND-DEFAULT-BUILDERTREND-FLAT-RATE");

  // Haslett P0 first, then remaining by name.
  const ordered = [...jobs].sort((a, b) => {
    const aH = /haslett/i.test(a.name) || /haslett/i.test(a.slug) ? 0 : 1;
    const bH = /haslett/i.test(b.name) || /haslett/i.test(b.slug) ? 0 : 1;
    if (aH !== bH) return aH - bH;
    return a.name.localeCompare(b.name);
  });

  const results: ImportResult[] = [];
  let created = 0;
  let skipped = 0;
  let errors = 0;

  for (const job of ordered) {
    if (jobSlugFilter && !job.slug.toLowerCase().includes(jobSlugFilter) && !job.name.toLowerCase().includes(jobSlugFilter)) {
      continue;
    }
    if (!job.wciId) {
      console.warn(`SKIP job without wciId: ${job.name}`);
      continue;
    }
    const existing = await prisma.changeOrder.findMany({
      where: { jobId: job.wciId },
      select: { id: true, notesBuilder: true, title: true, status: true },
    });
    const byTag = new Map<string, (typeof existing)[number]>();
    for (const co of existing) {
      const m = co.notesBuilder?.match(/btChangeOrderId:(\d+)/);
      if (m) byTag.set(m[1]!, co);
    }

    for (const co of job.cos ?? []) {
      const btStatus = btStatusMessage(co);
      const tag = idempotencyTag(co.id);
      const costCents = moneyToCents(co.builderCost);
      const priceCents = moneyToCents(co.totalWithTax ?? co.ownerPrice);
      const costCodeId = priceCents < 0 && creditCode ? creditCode.id : flatRate.id;

      if (byTag.has(String(co.id))) {
        const ex = byTag.get(String(co.id))!;
        skipped++;
        results.push({
          job: job.name,
          wciId: job.wciId,
          btCoId: co.id,
          title: co.title,
          btStatus,
          action: "skipped",
          wciIdCo: ex.id,
          wciStatus: ex.status,
          flatCostCents: costCents,
          flatClientPriceCents: priceCents,
        });
        console.log(`SKIP ${job.name} / ${co.title} (already ${ex.status})`);
        continue;
      }

      if (dryRun) {
        created++;
        results.push({
          job: job.name,
          wciId: job.wciId,
          btCoId: co.id,
          title: co.title,
          btStatus,
          action: "created",
          flatCostCents: costCents,
          flatClientPriceCents: priceCents,
        });
        console.log(`DRY ${job.name} / ${co.title} ${btStatus} cost=${costCents} price=${priceCents}`);
        continue;
      }

      try {
        const notesBuilder = [
          tag,
          `btJobId:${job.btJobId}`,
          `btStatus:${btStatus}`,
          co.approvalStatus?.updatedBy ? `btUpdatedBy:${co.approvalStatus.updatedBy}` : null,
          co.approvalStatus?.dateUpdated ? `btStatusChanged:${co.approvalStatus.dateUpdated}` : null,
          "importedFrom:BT ChangeOrders/Grid (FLAT; line items unavailable)",
        ]
          .filter(Boolean)
          .join("\n");

        const createdCo = await createChangeOrder({
          organizationId: org.id,
          jobId: job.wciId,
          title: co.title || `BT CO ${co.id}`,
          mode: "FLAT",
          flatCostCodeId: costCodeId,
          flatCostCents: costCents as Cents,
          flatClientPriceCents: priceCents as Cents,
          deadline: co.deadline ? new Date(co.deadline) : null,
          notesBuilder,
        });

        let finalStatus = createdCo.status;
        const msg = btStatus.toLowerCase();

        if (msg === "approved") {
          // approveChangeOrder accepts DRAFT; applies budget deltas.
          const approved = await approveChangeOrder({
            organizationId: org.id,
            changeOrderId: createdCo.id,
            clientSignatureName: co.approvalStatus?.updatedBy ?? undefined,
          });
          finalStatus = approved.changeOrder.status;
          if (co.approvalStatus?.dateUpdated) {
            await prisma.changeOrder.update({
              where: { id: createdCo.id },
              data: {
                approvedAt: new Date(co.approvalStatus.dateUpdated),
                statusChangedAt: new Date(co.approvalStatus.dateUpdated),
                clientSignedAt: new Date(co.approvalStatus.dateUpdated),
              },
            });
          }
        } else if (msg === "pending") {
          const sent = await markChangeOrderSent(org.id, createdCo.id);
          finalStatus = sent.status;
        } else if (msg === "declined" || msg === "recalled") {
          const declined = await declineChangeOrder(org.id, createdCo.id);
          finalStatus = declined.status;
        }
        // Draft → leave DRAFT

        created++;
        results.push({
          job: job.name,
          wciId: job.wciId,
          btCoId: co.id,
          title: co.title,
          btStatus,
          action: "created",
          wciIdCo: createdCo.id,
          wciStatus: finalStatus,
          flatCostCents: costCents,
          flatClientPriceCents: priceCents,
        });
        console.log(`OK ${job.name} / ${co.title} → ${finalStatus} (${createdCo.id})`);
      } catch (e) {
        errors++;
        const error = e instanceof Error ? e.message : String(e);
        results.push({
          job: job.name,
          wciId: job.wciId,
          btCoId: co.id,
          title: co.title,
          btStatus,
          action: "error",
          flatCostCents: costCents,
          flatClientPriceCents: priceCents,
          error,
        });
        console.error(`ERR ${job.name} / ${co.title}: ${error}`);
      }
    }
  }

  const summary = { dryRun, created, skipped, errors, total: results.length, at: new Date().toISOString() };
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
