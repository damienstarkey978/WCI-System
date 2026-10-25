/** GET /jobs/{jobId}/budget/export?view=standard — the Job Costing Budget as a CSV download, for a signed-in staff user. */

import { currentAppUser } from "@/lib/auth";
import { getJobBudget, JobNotFoundError } from "@/lib/budget/service";
import { budgetToCsv } from "@/lib/budget/export";
import { groupFunnelLines } from "@/lib/budget/grouping";
import { budgetViewByKey, type BudgetColumnId } from "@/lib/contract-type";

export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await context.params;

  const user = await currentAppUser();
  if (!user) return new Response("Not signed in.", { status: 401 });

  let view;
  try {
    view = await getJobBudget(jobId, user.organizationId);
  } catch (error) {
    if (error instanceof JobNotFoundError) return new Response("Job not found.", { status: 404 });
    throw error;
  }

  const selected = budgetViewByKey(new URL(request.url).searchParams.get("view") ?? "standard");
  const columns = (view.columns as readonly BudgetColumnId[]).filter((id) => (selected.columns as readonly BudgetColumnId[]).includes(id));
  const groups = groupFunnelLines(view.funnel.lines, view.costCodes);

  const safeName = view.job.name.replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "") || "job";
  return new Response(budgetToCsv({ groups, totals: view.funnel.totals, columns }), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="budget-${safeName}-${selected.key}.csv"`,
    },
  });
}
