/**
 * WCI Invoice -> QBO Invoice (CLAUDE.md 2.3, "Invoices ... WCI -> QBO"). Linked by
 * Invoice.qboInvoiceId once synced. Depends on customers.ts: a QBO Invoice must
 * reference an existing QBO Customer, so the invoice's client is synced first if it
 * hasn't been already.
 *
 * Simplification (documented, not hidden): every line posts against one generic
 * "WCI OS Services" QBO Item rather than a per-cost-code Item/Account, since WCI OS has
 * no cost-code-to-QuickBooks-account mapping yet. That mapping is real design work,
 * deferred to the same pass as Vendor/Bill sync (Bills need it too, and more of it —
 * every line there needs an Account or Item). Revenue still lands in QuickBooks
 * correctly; it just isn't broken out by cost code the way Bills eventually will be.
 */

import { db } from "@/lib/db";
import { accountingRequest } from "@/lib/quickbooks/client";
import { getValidAccessToken, type ValidQuickBooksAccess } from "@/lib/quickbooks/connection-service";
import { recordSyncAttempt } from "@/lib/quickbooks/sync-log";

import { syncClientToQuickBooks } from "./customers";

export class InvoiceNotFoundError extends Error {
  constructor(invoiceId: string) {
    super(`Invoice ${invoiceId} not found.`);
    this.name = "InvoiceNotFoundError";
  }
}

export class InvoiceHasNoClientError extends Error {
  constructor(invoiceId: string) {
    super(`Invoice ${invoiceId}'s job has no client with portal access — nothing to bill in QuickBooks.`);
    this.name = "InvoiceHasNoClientError";
  }
}

const SERVICE_ITEM_NAME = "WCI OS Services";

interface QboRef {
  readonly Id: string;
  readonly SyncToken: string;
}

async function ensureServiceItemId(access: ValidQuickBooksAccess): Promise<string> {
  const escapedName = SERVICE_ITEM_NAME.replace(/'/g, "\\'");
  const found = await accountingRequest<{ QueryResponse: { Item?: QboRef[] } }>({
    ...access,
    method: "GET",
    path: "query",
    query: { query: `select * from Item where Name = '${escapedName}'` },
  });
  const existing = found.QueryResponse.Item?.[0];
  if (existing) return existing.Id;

  const incomeAccount = await findIncomeAccountId(access);
  const created = await accountingRequest<{ Item: QboRef }>({
    ...access,
    method: "POST",
    path: "item",
    body: { Name: SERVICE_ITEM_NAME, Type: "Service", IncomeAccountRef: { value: incomeAccount } },
  });
  return created.Item.Id;
}

async function findIncomeAccountId(access: ValidQuickBooksAccess): Promise<string> {
  const result = await accountingRequest<{ QueryResponse: { Account?: QboRef[] } }>({
    ...access,
    method: "GET",
    path: "query",
    query: { query: "select * from Account where AccountType = 'Income' maxresults 1" },
  });
  const account = result.QueryResponse.Account?.[0];
  if (!account) {
    throw new Error("No Income account found in this QuickBooks company to post revenue against.");
  }
  return account.Id;
}

/** Push one Invoice to QuickBooks, creating or updating as needed. Returns the QBO Invoice id. */
export async function syncInvoiceToQuickBooks(organizationId: string, invoiceId: string): Promise<string> {
  const invoice = await db.invoice.findFirst({
    where: { id: invoiceId, organizationId },
    include: { lineItems: { orderBy: { sortOrder: "asc" } }, job: { include: { clientAccess: { include: { client: true }, orderBy: { createdAt: "asc" }, take: 1 } } } },
  });
  if (!invoice) throw new InvoiceNotFoundError(invoiceId);

  const client = invoice.job.clientAccess[0]?.client;
  if (!client) throw new InvoiceHasNoClientError(invoiceId);

  try {
    const qboCustomerId = client.qboCustomerId ?? (await syncClientToQuickBooks(organizationId, client.id));
    const access = await getValidAccessToken(organizationId);
    const serviceItemId = await ensureServiceItemId(access);

    const lines =
      invoice.lineItems.length > 0
        ? invoice.lineItems.map((line) => ({
            Amount: line.amountCents / 100,
            DetailType: "SalesItemLineDetail" as const,
            Description: line.description ?? line.title,
            SalesItemLineDetail: { ItemRef: { value: serviceItemId } },
          }))
        : [
            {
              Amount: invoice.amountCents / 100,
              DetailType: "SalesItemLineDetail" as const,
              Description: invoice.invoiceNumber,
              SalesItemLineDetail: { ItemRef: { value: serviceItemId } },
            },
          ];

    const invoiceFields = {
      CustomerRef: { value: qboCustomerId },
      DocNumber: invoice.invoiceNumber,
      Line: lines,
      ...(invoice.dueOn ? { DueDate: invoice.dueOn.toISOString().slice(0, 10) } : {}),
    };

    const qboInvoice = invoice.qboInvoiceId
      ? await accountingRequest<{ Invoice: QboRef }>({
          ...access,
          method: "POST",
          path: "invoice",
          body: { Id: invoice.qboInvoiceId, SyncToken: (await currentSyncToken(access, invoice.qboInvoiceId)), sparse: true, ...invoiceFields },
        })
      : await accountingRequest<{ Invoice: QboRef }>({ ...access, method: "POST", path: "invoice", body: invoiceFields });

    await db.invoice.update({
      where: { id: invoice.id },
      data: { qboInvoiceId: qboInvoice.Invoice.Id, qboSyncToken: qboInvoice.Invoice.SyncToken },
    });
    await recordSyncAttempt({ organizationId, entityType: "INVOICE", direction: "TO_QBO", wciRecordId: invoice.id, qboId: qboInvoice.Invoice.Id });
    return qboInvoice.Invoice.Id;
  } catch (error) {
    await recordSyncAttempt({ organizationId, entityType: "INVOICE", direction: "TO_QBO", wciRecordId: invoice.id, error });
    throw error;
  }
}

/** QBO's SyncToken drifts if the invoice was touched in QBO directly — refetch it right before an update rather than trust our cached copy. */
async function currentSyncToken(access: ValidQuickBooksAccess, qboInvoiceId: string): Promise<string> {
  const existing = await accountingRequest<{ Invoice: QboRef }>({ ...access, method: "GET", path: `invoice/${qboInvoiceId}` });
  return existing.Invoice.SyncToken;
}
