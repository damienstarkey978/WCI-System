/**
 * WCI Client -> QBO Customer (CLAUDE.md 2.3, "Customers ... WCI -> QBO"). One Client
 * maps to one QBO Customer, linked by Client.qboCustomerId once synced — presence of
 * that id, not a status enum, is what "synced" means (same pattern as
 * Client.activatedAt). Invoice sync (../sync/invoices.ts) depends on this running
 * first: a QBO Invoice must reference an existing QBO Customer.
 */

import { db } from "@/lib/db";
import { accountingRequest, QuickBooksApiError } from "@/lib/quickbooks/client";
import { getValidAccessToken } from "@/lib/quickbooks/connection-service";
import { recordSyncAttempt } from "@/lib/quickbooks/sync-log";

export class ClientNotFoundError extends Error {
  constructor(clientId: string) {
    super(`Client ${clientId} not found.`);
    this.name = "ClientNotFoundError";
  }
}

interface QboCustomerRef {
  readonly Id: string;
  readonly SyncToken: string;
}

interface QboCustomer extends QboCustomerRef {
  readonly DisplayName: string;
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

/** Push one Client to QuickBooks as a Customer, creating or updating as needed. Returns the QBO Customer id. */
export async function syncClientToQuickBooks(organizationId: string, clientId: string): Promise<string> {
  const client = await db.client.findFirst({ where: { id: clientId, organizationId } });
  if (!client) throw new ClientNotFoundError(clientId);

  try {
    const access = await getValidAccessToken(organizationId);
    const qboId = await pushCustomer(access, client);

    await db.client.update({ where: { id: client.id }, data: { qboCustomerId: qboId } });
    await recordSyncAttempt({ organizationId, entityType: "CUSTOMER", direction: "TO_QBO", wciRecordId: client.id, qboId });
    return qboId;
  } catch (error) {
    await recordSyncAttempt({ organizationId, entityType: "CUSTOMER", direction: "TO_QBO", wciRecordId: client.id, error });
    throw error;
  }
}

async function pushCustomer(
  access: Awaited<ReturnType<typeof getValidAccessToken>>,
  client: { readonly id: string; readonly name: string; readonly email: string; readonly phone: string | null; readonly qboCustomerId: string | null },
): Promise<string> {
  const customerFields = {
    DisplayName: client.name,
    PrimaryEmailAddr: { Address: client.email },
    ...(client.phone ? { PrimaryPhone: { FreeFormNumber: client.phone } } : {}),
  };

  if (client.qboCustomerId) {
    const existing = await accountingRequest<{ Customer: QboCustomer }>({
      ...access,
      method: "GET",
      path: `customer/${client.qboCustomerId}`,
    });
    const updated = await accountingRequest<{ Customer: QboCustomer }>({
      ...access,
      method: "POST",
      path: "customer",
      body: { Id: existing.Customer.Id, SyncToken: existing.Customer.SyncToken, sparse: true, ...customerFields },
    });
    return updated.Customer.Id;
  }

  try {
    const created = await accountingRequest<{ Customer: QboCustomer }>({
      ...access,
      method: "POST",
      path: "customer",
      body: customerFields,
    });
    return created.Customer.Id;
  } catch (error) {
    if (!duplicateNameFaultCode(error)) throw error;

    // QBO enforces a unique DisplayName across all customers — a name collision (e.g.
    // this customer was already created directly in QBO) means we should link to that
    // existing record rather than fail the sync.
    const found = await accountingRequest<{ QueryResponse: { Customer?: QboCustomer[] } }>({
      ...access,
      method: "GET",
      path: "query",
      query: { query: `select * from Customer where DisplayName = '${client.name.replace(/'/g, "\\'")}'` },
    });
    const match = found.QueryResponse.Customer?.[0];
    if (!match) throw error;
    return match.Id;
  }
}
