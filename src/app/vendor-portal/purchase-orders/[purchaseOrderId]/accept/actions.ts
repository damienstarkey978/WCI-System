"use server";

import { headers } from "next/headers";

import { VendorActionTokenPurpose } from "@/generated/prisma/enums";
import { db } from "@/lib/db";
import { InvalidActionTokenError, redeemActionToken } from "@/lib/vendor-portal/auth";
import { currentVendorPortalSession } from "@/lib/vendor-portal/browser-session";
import {
  acceptPurchaseOrder,
  PurchaseOrderNotAcceptableError,
  PurchaseOrderNotAssignedToVendorError,
  PurchaseOrderNotFoundError,
} from "@/lib/vendor-portal/service";

export interface AcceptActionState {
  readonly error?: string;
  readonly ok?: boolean;
}

function clientIpFromHeaders(headerList: Headers): string | undefined {
  return headerList.get("x-forwarded-for")?.split(",")[0]?.trim() ?? undefined;
}

/**
 * Headless / session vendor acceptance of a PO. Token comes from the emailed
 * Send link; a logged-in portal session can accept without a token when the PO
 * is assigned to them.
 */
export async function acceptPurchaseOrderAction(
  _previous: AcceptActionState,
  formData: FormData,
): Promise<AcceptActionState> {
  const purchaseOrderId = String(formData.get("purchaseOrderId") ?? "");
  const token = String(formData.get("token") ?? "").trim() || null;
  const signatureName = String(formData.get("signatureName") ?? "").trim();
  if (!purchaseOrderId) return { error: "Missing purchase order." };
  if (!signatureName) return { error: "Type your name to e-sign." };

  const purchaseOrder = await db.purchaseOrder.findUnique({
    where: { id: purchaseOrderId },
    select: { id: true, organizationId: true },
  });
  if (!purchaseOrder) return { error: "Purchase order not found." };

  const headerList = await headers();
  const signatureIp = clientIpFromHeaders(headerList);

  try {
    if (token) {
      await redeemActionToken(token, VendorActionTokenPurpose.PO_ACCEPTANCE, purchaseOrderId, (vendorId) =>
        acceptPurchaseOrder({
          organizationId: purchaseOrder.organizationId,
          purchaseOrderId,
          vendorId,
          signatureName,
          signatureIp,
        }),
      );
      return { ok: true };
    }

    const session = await currentVendorPortalSession();
    if (!session) return { error: "Open the link from your email, or sign in to the vendor portal first." };
    if (session.organizationId !== purchaseOrder.organizationId) {
      return { error: "Purchase order not found." };
    }

    await acceptPurchaseOrder({
      organizationId: purchaseOrder.organizationId,
      purchaseOrderId,
      vendorId: session.vendorId,
      signatureName,
      signatureIp,
    });
    return { ok: true };
  } catch (error) {
    if (error instanceof InvalidActionTokenError) {
      return { error: "This acceptance link is invalid or has already been used. Ask the office to re-send the PO." };
    }
    if (
      error instanceof PurchaseOrderNotFoundError ||
      error instanceof PurchaseOrderNotAssignedToVendorError ||
      error instanceof PurchaseOrderNotAcceptableError
    ) {
      return { error: error.message };
    }
    throw error;
  }
}
