/**
 * Shared QBO Chart-of-Accounts lookups. Read-only on purpose: this integration never
 * creates a ledger Account — restructuring a company's chart of accounts is a
 * bookkeeping decision, not something a sync should do without being asked. Everything
 * that needs a GL destination (the generic Invoice item, per-cost-code Bill items)
 * points at an account the company already has.
 */

import { accountingRequest } from "@/lib/quickbooks/client";
import type { ValidQuickBooksAccess } from "@/lib/quickbooks/connection-service";

interface QboAccountRef {
  readonly Id: string;
}

export class NoQuickBooksAccountError extends Error {
  constructor(accountType: string) {
    super(`No ${accountType} account found in this QuickBooks company. Add one in QuickBooks, then try again.`);
    this.name = "NoQuickBooksAccountError";
  }
}

/** The account revenue posts against on the generic Invoice line item. */
export async function findIncomeAccountId(access: ValidQuickBooksAccess): Promise<string> {
  const result = await accountingRequest<{ QueryResponse: { Account?: QboAccountRef[] } }>({
    ...access,
    method: "GET",
    path: "query",
    query: { query: "select * from Account where AccountType = 'Income' maxresults 1" },
  });
  const account = result.QueryResponse.Account?.[0];
  if (!account) throw new NoQuickBooksAccountError("Income");
  return account.Id;
}

/**
 * The account cost posts against on a per-cost-code Bill item. Prefers Cost of Goods
 * Sold (the standard home for job costs) and falls back to Expense if the company has
 * no COGS account set up.
 */
export async function findCostOfGoodsSoldAccountId(access: ValidQuickBooksAccess): Promise<string> {
  const cogs = await accountingRequest<{ QueryResponse: { Account?: QboAccountRef[] } }>({
    ...access,
    method: "GET",
    path: "query",
    query: { query: "select * from Account where AccountType = 'Cost of Goods Sold' maxresults 1" },
  });
  const cogsAccount = cogs.QueryResponse.Account?.[0];
  if (cogsAccount) return cogsAccount.Id;

  const expense = await accountingRequest<{ QueryResponse: { Account?: QboAccountRef[] } }>({
    ...access,
    method: "GET",
    path: "query",
    query: { query: "select * from Account where AccountType = 'Expense' maxresults 1" },
  });
  const expenseAccount = expense.QueryResponse.Account?.[0];
  if (!expenseAccount) throw new NoQuickBooksAccountError("Cost of Goods Sold or Expense");
  return expenseAccount.Id;
}
