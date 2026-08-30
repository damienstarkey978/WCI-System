/**
 * WCI Vendor -> QBO Vendor (CLAUDE.md 2.3: Vendors sync WCI -> QBO). One Vendor maps to
 * one QBO Vendor, linked by Vendor.qboVendorId once synced. Same shape as
 * ../sync/customers.ts (Client -> QBO Customer) — Vendors need no cost-code-to-account
 * mapping the way Bills eventually will, so this doesn't wait on that design work.
 */

import { db } from "@/lib/db";
import { accountingRequest, QuickBooksApiError } from "@/lib/quickbooks/client";
import { getValidAccessToken, type ValidQuickBooksAccess } from "@/lib/quickbooks/connection-service";
import { recordSyncAttempt } from "@/lib/quickbooks/sync-log";

export class VendorNotFoundError extends Error {
  constructor(vendorId: string) {
    super(`Vendor ${vendorId} not found.`);
    this.name = "VendorNotFoundError";
  }
}

interface QboVendorRef {
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

/** Push one Vendor to QuickBooks, creating or updating as needed. Returns the QBO Vendor id. */
export async function syncVendorToQuickBooks(organizationId: string, vendorId: string): Promise<string> {
  const vendor = await db.vendor.findFirst({ where: { id: vendorId, organizationId } });
  if (!vendor) throw new VendorNotFoundError(vendorId);

  try {
    const access = await getValidAccessToken(organizationId);
    const qboId = await pushVendor(access, vendor);

    await db.vendor.update({ where: { id: vendor.id }, data: { qboVendorId: qboId } });
    await recordSyncAttempt({ organizationId, entityType: "VENDOR", direction: "TO_QBO", wciRecordId: vendor.id, qboId });
    return qboId;
  } catch (error) {
    await recordSyncAttempt({ organizationId, entityType: "VENDOR", direction: "TO_QBO", wciRecordId: vendor.id, error });
    throw error;
  }
}

async function pushVendor(
  access: ValidQuickBooksAccess,
  vendor: {
    readonly id: string;
    readonly name: string;
    readonly email: string;
    readonly phone: string | null;
    readonly addressLine1: string | null;
    readonly city: string | null;
    readonly state: string | null;
    readonly postalCode: string | null;
    readonly qboVendorId: string | null;
  },
): Promise<string> {
  const vendorFields = {
    DisplayName: vendor.name,
    PrimaryEmailAddr: { Address: vendor.email },
    ...(vendor.phone ? { PrimaryPhone: { FreeFormNumber: vendor.phone } } : {}),
    ...(vendor.addressLine1
      ? {
          BillAddr: {
            Line1: vendor.addressLine1,
            City: vendor.city ?? undefined,
            CountrySubDivisionCode: vendor.state ?? undefined,
            PostalCode: vendor.postalCode ?? undefined,
          },
        }
      : {}),
  };

  if (vendor.qboVendorId) {
    const existing = await accountingRequest<{ Vendor: QboVendorRef }>({
      ...access,
      method: "GET",
      path: `vendor/${vendor.qboVendorId}`,
    });
    const updated = await accountingRequest<{ Vendor: QboVendorRef }>({
      ...access,
      method: "POST",
      path: "vendor",
      body: { Id: existing.Vendor.Id, SyncToken: existing.Vendor.SyncToken, sparse: true, ...vendorFields },
    });
    return updated.Vendor.Id;
  }

  try {
    const created = await accountingRequest<{ Vendor: QboVendorRef }>({
      ...access,
      method: "POST",
      path: "vendor",
      body: vendorFields,
    });
    return created.Vendor.Id;
  } catch (error) {
    if (!duplicateNameFaultCode(error)) throw error;

    // QBO enforces a unique DisplayName across all vendors — a name collision means we
    // should link to that existing record rather than fail the sync.
    const found = await accountingRequest<{ QueryResponse: { Vendor?: QboVendorRef[] } }>({
      ...access,
      method: "GET",
      path: "query",
      query: { query: `select * from Vendor where DisplayName = '${vendor.name.replace(/'/g, "\\'")}'` },
    });
    const match = found.QueryResponse.Vendor?.[0];
    if (!match) throw error;
    return match.Id;
  }
}
