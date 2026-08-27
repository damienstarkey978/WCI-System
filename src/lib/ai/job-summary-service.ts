/**
 * Database wiring for the agent-facing job summary. Keeps src/lib/ai/job-summary-
 * assistant.ts free of Prisma so its Claude-calling logic stays unit-testable with
 * a fake client — same split as every other AI module here.
 *
 * Unlike weekly-summary-service.ts, this deliberately pulls the FULL internal
 * picture (real cost, not just client price) — getJobBudget(), not
 * getClientBudgetView() — since this summary is for staff/agents, never a client.
 */

import { RfiStatus, TodoStatus } from "@/generated/prisma/enums";
import { getJobBudget, JobNotFoundError } from "@/lib/budget/service";
import { db } from "@/lib/db";
import { formatCents } from "@/lib/money";
import { getComputedSchedule } from "@/lib/scheduling/service";
import { generateJobSummary } from "@/lib/ai/job-summary-assistant";

export { JobNotFoundError };

function buildInternalContextText(
  funnelTotals: Awaited<ReturnType<typeof getJobBudget>>["funnel"]["totals"],
  scheduleLine: string | null,
  openRfiCount: number,
  openTodoCount: number,
  recentLogs: readonly { readonly createdAt: Date; readonly note: string }[],
): string {
  const lines = [
    `Budget: original ${formatCents(funnelTotals.originalBudgetCostCents)}, revised ${formatCents(funnelTotals.revisedBudgetCostCents)}, ` +
      `projected ${formatCents(funnelTotals.projectedCostCents)}, actual-to-date ${formatCents(funnelTotals.actualCostCents)}, ` +
      `cost to complete ${formatCents(funnelTotals.costToCompleteCents)}.`,
    `Client pricing: revised ${formatCents(funnelTotals.revisedClientPriceCents)}, invoiced ${formatCents(funnelTotals.amountInvoicedCents)}, ` +
      `remaining to invoice ${formatCents(funnelTotals.remainingToInvoiceCents)}. Projected profit ${formatCents(funnelTotals.projectedProfitCents)}.`,
    scheduleLine ?? "No schedule created yet.",
    `${openRfiCount} open RFI(s), ${openTodoCount} open todo(s).`,
  ];

  if (recentLogs.length > 0) {
    lines.push("Recent daily logs:");
    for (const log of recentLogs) {
      lines.push(`- ${log.createdAt.toISOString().slice(0, 10)}: ${log.note}`);
    }
  }

  return lines.join("\n");
}

export interface CreateJobSummaryInput {
  readonly organizationId: string;
  readonly jobId: string;
}

export async function createJobSummary(input: CreateJobSummaryInput): Promise<{ readonly summary: string }> {
  const budgetView = await getJobBudget(input.jobId, input.organizationId);

  const schedule = await db.schedule.findFirst({ where: { organizationId: input.organizationId, jobId: input.jobId }, select: { id: true } });
  let scheduleLine: string | null = null;
  if (schedule) {
    const computed = await getComputedSchedule(input.organizationId, schedule.id);
    scheduleLine = computed.projectFinishDate
      ? `Schedule: ${computed.items.length} item(s), projected finish ${computed.projectFinishDate.toISOString().slice(0, 10)}, ` +
        `${computed.items.filter((item) => item.isCriticalPath).length} on the critical path.`
      : `Schedule: ${computed.items.length} item(s), no computable finish date yet.`;
  }

  const [openRfiCount, openTodoCount, recentLogs] = await Promise.all([
    db.rfi.count({ where: { organizationId: input.organizationId, jobId: input.jobId, status: { not: RfiStatus.CLOSED } } }),
    db.todo.count({ where: { organizationId: input.organizationId, jobId: input.jobId, status: { not: TodoStatus.DONE } } }),
    db.dailyLog.findMany({
      where: { organizationId: input.organizationId, jobId: input.jobId },
      orderBy: { createdAt: "desc" },
      take: 3,
      select: { createdAt: true, note: true },
    }),
  ]);

  const contextText = buildInternalContextText(budgetView.funnel.totals, scheduleLine, openRfiCount, openTodoCount, recentLogs);

  const summary = await generateJobSummary({ jobName: budgetView.job.name, contextText });

  return { summary };
}
