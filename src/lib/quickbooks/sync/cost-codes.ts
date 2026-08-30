/**
 * CostCode -> QBO Item (CLAUDE.md 2.3's Bill sync needs this: every QBO Bill line
 * requires an Account or Item reference, and WCI OS bills are cost-coded, not
 * account-coded). One two-sided Service Item per cost code — "two-sided" meaning it
 * carries both an IncomeAccountRef and an ExpenseAccountRef, which is what makes a QBO
 * Item usable on both sales and purchase transactions. Both refs point at one shared,
 * already-existing account (../sync/accounts.ts) rather than a per-cost-code account:
 * creating a new GL account per cost code would restructure the company's chart of
 * accounts, which nothing in this integration does without being asked. Items are the
 * right place for that many-per-cost-code granularity — QBO expects a growing catalog
 * of them, unlike accounts.
 */

import { db } from "@/lib/db";
import { accountingRequest, QuickBooksApiError } from "@/lib/quickbooks/client";
import type { ValidQuickBooksAccess } from "@/lib/quickbooks/connection-service";

import { findCostOfGoodsSoldAccountId, findIncomeAccountId } from "./accounts";

export class CostCodeNotFoundError extends Error {
  constructor(costCodeId: string) {
    super(`Cost code ${costCodeId} not found.`);
    this.name = "CostCodeNotFoundError";
  }
}

interface QboItemRef {
  readonly Id: string;
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

function itemName(costCode: { readonly code: string; readonly name: string }): string {
  return `${costCode.code} - ${costCode.name}`;
}

/** Find or create this cost code's QBO Item, caching the id on CostCode.qboItemId. */
export async function ensureCostCodeItemId(access: ValidQuickBooksAccess, organizationId: string, costCodeId: string): Promise<string> {
  const costCode = await db.costCode.findFirst({ where: { id: costCodeId, organizationId } });
  if (!costCode) throw new CostCodeNotFoundError(costCodeId);
  if (costCode.qboItemId) return costCode.qboItemId;

  const name = itemName(costCode);
  const escapedName = name.replace(/'/g, "\\'");

  let itemId: string;
  try {
    const found = await accountingRequest<{ QueryResponse: { Item?: QboItemRef[] } }>({
      ...access,
      method: "GET",
      path: "query",
      query: { query: `select * from Item where Name = '${escapedName}'` },
    });
    const existing = found.QueryResponse.Item?.[0];
    if (existing) {
      itemId = existing.Id;
    } else {
      const [incomeAccount, cogsAccount] = await Promise.all([findIncomeAccountId(access), findCostOfGoodsSoldAccountId(access)]);
      const created = await accountingRequest<{ Item: QboItemRef }>({
        ...access,
        method: "POST",
        path: "item",
        body: {
          Name: name,
          Type: "Service",
          IncomeAccountRef: { value: incomeAccount },
          ExpenseAccountRef: { value: cogsAccount },
        },
      });
      itemId = created.Item.Id;
    }
  } catch (error) {
    if (!duplicateNameFaultCode(error)) throw error;
    const found = await accountingRequest<{ QueryResponse: { Item?: QboItemRef[] } }>({
      ...access,
      method: "GET",
      path: "query",
      query: { query: `select * from Item where Name = '${escapedName}'` },
    });
    const match = found.QueryResponse.Item?.[0];
    if (!match) throw error;
    itemId = match.Id;
  }

  await db.costCode.update({ where: { id: costCode.id }, data: { qboItemId: itemId } });
  return itemId;
}
