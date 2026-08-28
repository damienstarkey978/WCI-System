"use server";

import { revalidatePath } from "next/cache";

import { ChangeOrderMode, RateMode } from "@/generated/prisma/enums";
import { requireAppUser } from "@/lib/auth";
import {
  approveChangeOrder,
  ChangeOrderNotFoundError,
  ChangeOrderNotPendingError,
  createChangeOrder,
  declineChangeOrder,
  JobNotFoundError,
  JobNotOpenError,
} from "@/lib/change-orders/service";
import { parseCostCodeLineItems } from "@/lib/financial/parse-line-items";
import { parseDollarsToCents, parsePercentToBasisPoints } from "@/lib/money";

export interface ActionState {
  readonly error?: string;
  readonly ok?: boolean;
}

export async function createChangeOrderAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireAppUser();

  const jobId = String(formData.get("jobId") ?? "");
  const title = String(formData.get("title") ?? "").trim();
  const mode = String(formData.get("mode") ?? "FLAT") === "ITEMIZED" ? ChangeOrderMode.ITEMIZED : ChangeOrderMode.FLAT;

  if (!title) return { error: "Title is required." };

  try {
    if (mode === ChangeOrderMode.FLAT) {
      const flatCostCodeId = String(formData.get("flatCostCodeId") ?? "");
      const flatCostRaw = String(formData.get("flatCost") ?? "");
      const flatClientPriceRaw = String(formData.get("flatClientPrice") ?? "");
      if (!flatCostCodeId) return { error: "Choose a cost code." };
      if (!flatCostRaw || !flatClientPriceRaw) return { error: "Cost and client price are required." };

      await createChangeOrder({
        organizationId: user.organizationId,
        jobId,
        title,
        mode,
        flatCostCodeId,
        flatCostCents: parseDollarsToCents(flatCostRaw),
        flatClientPriceCents: parseDollarsToCents(flatClientPriceRaw),
      });
    } else {
      const rateMode = String(formData.get("rateMode") ?? "MARKUP") === "MARGIN" ? RateMode.MARGIN : RateMode.MARKUP;
      const rateBasisPoints = parsePercentToBasisPoints(String(formData.get("rate") ?? "0") || "0");
      const lineItems = parseCostCodeLineItems(formData).map((item) => ({ ...item, rateMode, rateBasisPoints }));
      if (lineItems.length === 0) return { error: "Add at least one line item." };

      await createChangeOrder({ organizationId: user.organizationId, jobId, title, mode, lineItems });
    }
  } catch (error) {
    if (error instanceof JobNotFoundError || error instanceof JobNotOpenError) return { error: error.message };
    if (error instanceof Error && error.message.includes("Cannot parse")) return { error: error.message };
    throw error;
  }

  revalidatePath(`/jobs/${jobId}/change-orders`);
  return { ok: true };
}

export async function approveChangeOrderAction(formData: FormData): Promise<void> {
  const user = await requireAppUser();

  const jobId = String(formData.get("jobId") ?? "");
  const changeOrderId = String(formData.get("changeOrderId") ?? "");

  try {
    await approveChangeOrder({ organizationId: user.organizationId, changeOrderId });
  } catch (error) {
    if (error instanceof ChangeOrderNotFoundError || error instanceof ChangeOrderNotPendingError) return;
    throw error;
  }

  revalidatePath(`/jobs/${jobId}/change-orders`);
}

export async function declineChangeOrderAction(formData: FormData): Promise<void> {
  const user = await requireAppUser();

  const jobId = String(formData.get("jobId") ?? "");
  const changeOrderId = String(formData.get("changeOrderId") ?? "");

  try {
    await declineChangeOrder(user.organizationId, changeOrderId);
  } catch (error) {
    if (error instanceof ChangeOrderNotFoundError || error instanceof ChangeOrderNotPendingError) return;
    throw error;
  }

  revalidatePath(`/jobs/${jobId}/change-orders`);
}
