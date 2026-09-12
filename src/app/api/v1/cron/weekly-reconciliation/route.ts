/**
 * /api/v1/cron/weekly-reconciliation — the scheduled trigger for Duke's weekly
 * reconciliation job (vercel.json's crons array points here, Monday mornings UTC).
 *
 * Not gated by withApiAuth, same reasoning as /api/v1/webhooks/process: a scheduler
 * call isn't scoped to one organization, so there's no per-org API key to check.
 * Instead it checks the shared CRON_SECRET, matching Vercel Cron's own
 * `Authorization: Bearer $CRON_SECRET` convention; any other scheduler works the same
 * way as long as it sends that header.
 *
 * Runs every organization with an active QuickBooks connection — reconciliation is
 * meaningless without one. One organization's failure (QBO token expired mid-refresh,
 * a transient API error) is recorded and skipped rather than failing the whole batch.
 */

import { apiError } from "@/lib/api-auth";
import { db } from "@/lib/db";
import { cronSecret, isCronConfigured } from "@/lib/env";
import { runWeeklyReconciliation } from "@/lib/reconciliation/weekly-service";

function isAuthorized(request: Request): boolean {
  if (!isCronConfigured()) return false;
  return request.headers.get("authorization") === `Bearer ${cronSecret()}`;
}

async function runForEveryConnectedOrg() {
  const connections = await db.quickBooksConnection.findMany({
    where: { disconnectedAt: null },
    select: { organizationId: true },
  });

  let organizationsProcessed = 0;
  const errors: string[] = [];
  const runs: string[] = [];

  for (const connection of connections) {
    try {
      const summary = await runWeeklyReconciliation({ organizationId: connection.organizationId });
      runs.push(summary.id);
      organizationsProcessed += 1;
    } catch (error) {
      errors.push(`${connection.organizationId}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  return { organizationsConsidered: connections.length, organizationsProcessed, runs, errors };
}

export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return apiError(401, "unauthorized", "Missing or invalid scheduler authorization.");
  }
  return Response.json(await runForEveryConnectedOrg());
}

// Vercel Cron Jobs make GET requests by default.
export async function GET(request: Request) {
  return POST(request);
}
