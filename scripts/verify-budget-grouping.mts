/**
 * Proves the job costing grouping against the real database: that cost codes resolve
 * to their parent trade, that group subtotals add up to the job total, and that a
 * group's margin is recomputed rather than averaged.
 */
import { getJobBudget } from "../src/lib/budget/service";
import { groupFunnelLines } from "../src/lib/budget/grouping";
import { db } from "../src/lib/db";

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error("FAILED: " + msg);
  console.log("OK: " + msg);
}

async function main() {
  const org = await db.organization.findFirstOrThrow();
  // Two leaves under different parents, so grouping has something real to do.
  const children = await db.costCode.findMany({
    where: { organizationId: org.id, parentId: { not: null } },
    include: { parent: { select: { id: true, name: true } } },
    orderBy: { code: "asc" },
  });
  const first = children[0];
  const second = children.find((code) => code.parentId !== first.parentId);
  if (!second) throw new Error("Seed has no two cost codes under different parents.");

  const job = await db.job.create({
    data: { organizationId: org.id, name: `Grouping check ${Date.now()}`, contractType: "FIXED_PRICE", status: "OPEN" },
  });
  await db.budgetLine.createMany({
    data: [
      {
        jobId: job.id,
        costCodeId: first.id,
        originalBudgetCostCents: 50_000,
        revisedBudgetCostCents: 50_000,
        originalClientPriceCents: 100_000,
        revisedClientPriceCents: 100_000,
      },
      {
        jobId: job.id,
        costCodeId: second.id,
        originalBudgetCostCents: 5_000_000,
        revisedBudgetCostCents: 5_000_000,
        originalClientPriceCents: 5_555_556,
        revisedClientPriceCents: 5_555_556,
      },
    ],
  });

  const view = await getJobBudget(job.id, org.id);
  assert(view.costCodes[first.id]?.group?.name === first.parent!.name, "a cost code resolves to its parent trade");

  const groups = groupFunnelLines(view.funnel.lines, view.costCodes);
  assert(groups.length === 2, "lines under different parents land in different groups");
  assert(
    groups.every((group) => group.key !== "__ungrouped__"),
    "nothing falls into Ungrouped when every cost code has a parent",
  );

  const summed = groups.reduce((total, group) => total + group.subtotal.revisedBudgetCostCents, 0);
  assert(summed === view.funnel.totals.revisedBudgetCostCents, "group subtotals add up to the job total");

  const summedPrice = groups.reduce((total, group) => total + group.subtotal.revisedClientPriceCents, 0);
  assert(summedPrice === view.funnel.totals.revisedClientPriceCents, "and so do the client prices");

  // 50% margin on one line and 10% on a line 50x bigger: averaging would say 30%.
  const average = Math.round(
    groups.reduce((total, group) => total + group.subtotal.projectedMarginBasisPoints, 0) / groups.length,
  );
  assert(
    view.funnel.totals.projectedMarginBasisPoints === 1_071 && average !== view.funnel.totals.projectedMarginBasisPoints,
    `the job margin is weighted (${view.funnel.totals.projectedMarginBasisPoints}bp), not the average of its groups (${average}bp)`,
  );

  await db.budgetLine.deleteMany({ where: { jobId: job.id } });
  await db.job.delete({ where: { id: job.id } });

  console.log("\nJob costing grouping verified against the real database.");
  await db.$disconnect();
}

main().catch(async (error) => {
  console.error(error);
  await db.$disconnect();
  process.exit(1);
});
