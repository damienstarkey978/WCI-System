/**
 * Staff/agent-facing Client management (CLAUDE.md 2.3/2.4). Creating a Client
 * and granting job access are separate steps from inviting one to log in
 * (src/lib/client-portal/auth.ts) — CLAUDE.md 2.3's three independent states
 * (access granted / invited / activated) are three separate actions here, not
 * one combined "add client" call.
 */

import { getJobBudget } from "@/lib/budget/service";
import { db } from "@/lib/db";

export class JobNotFoundError extends Error {
  constructor(jobId: string) {
    super(`Job ${jobId} not found`);
    this.name = "JobNotFoundError";
  }
}

export class ClientNotFoundError extends Error {
  constructor(clientId: string) {
    super(`Client ${clientId} not found`);
    this.name = "ClientNotFoundError";
  }
}

export interface CreateClientInput {
  readonly organizationId: string;
  readonly name: string;
  readonly email: string;
  readonly phone?: string | null;
}

export async function createClient(input: CreateClientInput) {
  return db.client.create({
    data: {
      organizationId: input.organizationId,
      name: input.name,
      email: input.email,
      phone: input.phone ?? null,
    },
  });
}

export interface GrantJobAccessInput {
  readonly organizationId: string;
  readonly clientId: string;
  readonly jobId: string;
  readonly canViewDailyLogs?: boolean;
  readonly canViewSchedule?: boolean;
  readonly canViewDocuments?: boolean;
  readonly canViewBudget?: boolean;
  readonly canViewInvoices?: boolean;
  readonly canMakePayments?: boolean;
  readonly canViewBills?: boolean;
  readonly canViewSelections?: boolean;
  readonly canApproveSelections?: boolean;
  readonly canViewChangeOrders?: boolean;
  readonly canApproveChangeOrders?: boolean;
}

/**
 * Grant (or update) a client's per-job module visibility. Upsert rather than
 * create-only: re-running this to adjust one flag (e.g. turning on
 * canViewBudget for a specific client) shouldn't require a separate "update"
 * endpoint.
 */
export async function grantJobAccess(input: GrantJobAccessInput) {
  const [client, job] = await Promise.all([
    db.client.findFirst({ where: { id: input.clientId, organizationId: input.organizationId }, select: { id: true } }),
    db.job.findFirst({ where: { id: input.jobId, organizationId: input.organizationId }, select: { id: true } }),
  ]);
  if (!client) throw new ClientNotFoundError(input.clientId);
  if (!job) throw new JobNotFoundError(input.jobId);

  const flags = {
    canViewDailyLogs: input.canViewDailyLogs,
    canViewSchedule: input.canViewSchedule,
    canViewDocuments: input.canViewDocuments,
    canViewBudget: input.canViewBudget,
    canViewInvoices: input.canViewInvoices,
    canMakePayments: input.canMakePayments,
    canViewBills: input.canViewBills,
    canViewSelections: input.canViewSelections,
    canApproveSelections: input.canApproveSelections,
    canViewChangeOrders: input.canViewChangeOrders,
    canApproveChangeOrders: input.canApproveChangeOrders,
  };

  return db.clientJobAccess.upsert({
    where: { clientId_jobId: { clientId: input.clientId, jobId: input.jobId } },
    create: { clientId: input.clientId, jobId: input.jobId, ...flags },
    update: flags,
  });
}

/** Idempotent — revoking access that's already gone is a no-op, not an error. */
export async function revokeJobAccess(organizationId: string, clientId: string, jobId: string): Promise<void> {
  await db.clientJobAccess.deleteMany({ where: { clientId, jobId, job: { organizationId } } });
}

/**
 * The client-facing slice of the job budget: price only, never the cost/profit
 * columns getJobBudget() also returns. This is CLAUDE.md 2.3's "Client
 * Pricing" view of the Budget, and it is deliberately its own function rather
 * than a parameter on getJobBudget() — a client-visible endpoint should be
 * structurally incapable of returning cost data, not just configured not to.
 */
export async function getClientBudgetView(organizationId: string, jobId: string) {
  const full = await getJobBudget(jobId, organizationId);

  return {
    job: full.job,
    lines: full.funnel.lines.map((line) => ({
      costCodeId: line.costCodeId,
      costCode: full.costCodes[line.costCodeId] ?? null,
      originalClientPriceCents: line.originalClientPriceCents,
      revisedClientPriceCents: line.revisedClientPriceCents,
    })),
    totals: {
      originalClientPriceCents: full.funnel.totals.originalClientPriceCents,
      revisedClientPriceCents: full.funnel.totals.revisedClientPriceCents,
      amountInvoicedCents: full.funnel.totals.amountInvoicedCents,
      remainingToInvoiceCents: full.funnel.totals.remainingToInvoiceCents,
    },
  };
}
