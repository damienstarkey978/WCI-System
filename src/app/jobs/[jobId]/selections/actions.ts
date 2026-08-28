"use server";

import { revalidatePath } from "next/cache";

import { requireAppUser } from "@/lib/auth";
import {
  AllowanceNotFoundError,
  approveSelectionOption,
  CostCodeNotFoundError,
  createAllowance,
  createSelection,
  JobNotFoundError,
  JobNotOpenError,
  SelectionAlreadyDecidedError,
  SelectionNotFoundError,
} from "@/lib/selections/service";
import { parseDollarsToCents } from "@/lib/money";

export interface ActionState {
  readonly error?: string;
  readonly ok?: boolean;
}

export async function createAllowanceAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireAppUser();

  const jobId = String(formData.get("jobId") ?? "");
  const costCodeId = String(formData.get("costCodeId") ?? "");
  const title = String(formData.get("title") ?? "").trim();
  const amountRaw = String(formData.get("amount") ?? "");
  const clientPriceRaw = String(formData.get("clientPrice") ?? "");

  if (!costCodeId) return { error: "Choose a cost code." };
  if (!title) return { error: "Title is required." };
  if (!amountRaw || !clientPriceRaw) return { error: "Amount and client price are required." };

  try {
    await createAllowance({
      organizationId: user.organizationId,
      jobId,
      costCodeId,
      title,
      amountCents: parseDollarsToCents(amountRaw),
      clientPriceCents: parseDollarsToCents(clientPriceRaw),
    });
  } catch (error) {
    if (error instanceof JobNotFoundError || error instanceof CostCodeNotFoundError) return { error: error.message };
    if (error instanceof Error && error.message.includes("Cannot parse")) return { error: error.message };
    throw error;
  }

  revalidatePath(`/jobs/${jobId}/selections`);
  return { ok: true };
}

export async function createSelectionAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireAppUser();

  const jobId = String(formData.get("jobId") ?? "");
  const title = String(formData.get("title") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const dueDateRaw = String(formData.get("dueDate") ?? "");
  const allowanceId = String(formData.get("allowanceId") ?? "");

  if (!title) return { error: "Title is required." };

  const titles = formData.getAll("optionTitle").map(String);
  const prices = formData.getAll("optionPrice").map(String);
  const clientPrices = formData.getAll("optionClientPrice").map(String);

  try {
    const options = titles
      .map((optionTitle, index) => ({
        title: optionTitle.trim(),
        priceRaw: prices[index] ?? "",
        clientPriceRaw: clientPrices[index] ?? "",
      }))
      .filter((option) => option.title && option.priceRaw && option.clientPriceRaw)
      .map((option) => ({
        title: option.title,
        priceCents: parseDollarsToCents(option.priceRaw),
        clientPriceCents: parseDollarsToCents(option.clientPriceRaw),
      }));

    if (options.length === 0) return { error: "Add at least one option with a title, cost, and client price." };

    await createSelection({
      organizationId: user.organizationId,
      jobId,
      allowanceId: allowanceId || null,
      title,
      description: description || null,
      dueDate: dueDateRaw ? new Date(dueDateRaw) : null,
      options,
    });
  } catch (error) {
    if (error instanceof JobNotFoundError || error instanceof AllowanceNotFoundError) return { error: error.message };
    if (error instanceof Error && error.message.includes("Cannot parse")) return { error: error.message };
    throw error;
  }

  revalidatePath(`/jobs/${jobId}/selections`);
  return { ok: true };
}

export async function approveSelectionOptionAction(formData: FormData): Promise<void> {
  const user = await requireAppUser();

  const jobId = String(formData.get("jobId") ?? "");
  const selectionId = String(formData.get("selectionId") ?? "");
  const optionId = String(formData.get("optionId") ?? "");

  try {
    await approveSelectionOption({ organizationId: user.organizationId, selectionId, optionId });
  } catch (error) {
    if (
      error instanceof SelectionNotFoundError ||
      error instanceof SelectionAlreadyDecidedError ||
      error instanceof JobNotOpenError
    ) {
      return;
    }
    throw error;
  }

  revalidatePath(`/jobs/${jobId}/selections`);
}
