/**
 * WCI Job -> QBO sub-customer (CLAUDE.md 2.3, "Sub-customers/Projects ... WCI -> QBO").
 * QuickBooks models a job as a Customer with Job: true and a ParentRef pointing at the
 * client's own Customer — this is what gives per-job P&L in QBO reporting, distinct from
 * the client-level Customer that ../sync/customers.ts already pushes. Depends on that
 * module: a job can't become a sub-customer until its client is a customer.
 */

import { db } from "@/lib/db";
import { accountingRequest, QuickBooksApiError } from "@/lib/quickbooks/client";
import { getValidAccessToken, type ValidQuickBooksAccess } from "@/lib/quickbooks/connection-service";
import { recordSyncAttempt } from "@/lib/quickbooks/sync-log";

import { syncClientToQuickBooks } from "./customers";

export class JobNotFoundError extends Error {
  constructor(jobId: string) {
    super(`Job ${jobId} not found.`);
    this.name = "JobNotFoundError";
  }
}

export class JobHasNoClientError extends Error {
  constructor(jobId: string) {
    super(`Job ${jobId} has no client with portal access — nothing to link a QuickBooks sub-customer to.`);
    this.name = "JobHasNoClientError";
  }
}

interface QboCustomerRef {
  readonly Id: string;
  readonly SyncToken: string;
}

interface QboFaultError {
  readonly Fault?: { readonly Error?: ReadonlyArray<{ readonly code?: string; readonly Message?: string }> };
}

function duplicateNameFaultCode(error: unknown): boolean {
  if (!(error instanceof QuickBooksApiError)) return false;
  try {
    const parsed = JSON.parse(error.body) as QboFaultError;
    return parsed.Fault?.Error?.some((entry) => entry.code === "6240") ?? false;
  } catch {
    return false;
  }
}

/** Push one Job to QuickBooks as a sub-customer under its client, creating or updating as needed. Returns the QBO Customer id. */
export async function syncJobToQuickBooks(organizationId: string, jobId: string): Promise<string> {
  const job = await db.job.findFirst({
    where: { id: jobId, organizationId },
    include: { clientAccess: { include: { client: true }, orderBy: { createdAt: "asc" }, take: 1 } },
  });
  if (!job) throw new JobNotFoundError(jobId);

  const client = job.clientAccess[0]?.client;
  if (!client) throw new JobHasNoClientError(jobId);

  try {
    const parentQboCustomerId = client.qboCustomerId ?? (await syncClientToQuickBooks(organizationId, client.id));
    const access = await getValidAccessToken(organizationId);
    const qboId = await pushJob(access, job, client.name, parentQboCustomerId);

    await db.job.update({ where: { id: job.id }, data: { qboCustomerId: qboId } });
    await recordSyncAttempt({ organizationId, entityType: "JOB", direction: "TO_QBO", wciRecordId: job.id, qboId });
    return qboId;
  } catch (error) {
    await recordSyncAttempt({ organizationId, entityType: "JOB", direction: "TO_QBO", wciRecordId: job.id, error });
    throw error;
  }
}

async function pushJob(
  access: ValidQuickBooksAccess,
  job: { readonly id: string; readonly name: string; readonly qboCustomerId: string | null },
  parentDisplayName: string,
  parentQboCustomerId: string,
): Promise<string> {
  const jobFields = { DisplayName: job.name, Job: true, ParentRef: { value: parentQboCustomerId } };

  if (job.qboCustomerId) {
    const existing = await accountingRequest<{ Customer: QboCustomerRef }>({
      ...access,
      method: "GET",
      path: `customer/${job.qboCustomerId}`,
    });
    const updated = await accountingRequest<{ Customer: QboCustomerRef }>({
      ...access,
      method: "POST",
      path: "customer",
      body: { Id: existing.Customer.Id, SyncToken: existing.Customer.SyncToken, sparse: true, ...jobFields },
    });
    return updated.Customer.Id;
  }

  try {
    const created = await accountingRequest<{ Customer: QboCustomerRef }>({
      ...access,
      method: "POST",
      path: "customer",
      body: jobFields,
    });
    return created.Customer.Id;
  } catch (error) {
    if (!duplicateNameFaultCode(error)) throw error;

    // A sub-customer's DisplayName only needs to be unique among its siblings, but QBO's
    // duplicate check is against the fully-qualified "Parent:Job" name — link to that
    // existing record rather than fail the sync.
    const fullyQualifiedName = `${parentDisplayName}:${job.name}`.replace(/'/g, "\\'");
    const found = await accountingRequest<{ QueryResponse: { Customer?: QboCustomerRef[] } }>({
      ...access,
      method: "GET",
      path: "query",
      query: { query: `select * from Customer where FullyQualifiedName = '${fullyQualifiedName}'` },
    });
    const match = found.QueryResponse.Customer?.[0];
    if (!match) throw error;
    return match.Id;
  }
}
