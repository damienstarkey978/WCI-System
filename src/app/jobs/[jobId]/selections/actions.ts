"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { SelectionType } from "@/generated/prisma/enums";
import { requireAppUser } from "@/lib/auth";
import {
  addSelectionOption,
  AllowanceNotFoundError,
  approveSelectionOption,
  CostCodeNotFoundError,
  createAllowance,
  createSelection,
  JobNotFoundError,
  JobNotOpenError,
  SelectionAlreadyDecidedError,
  SelectionNotFoundError,
  updateSelection,
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
  const category = String(formData.get("category") ?? "").trim();
  const location = String(formData.get("location") ?? "").trim();
  const requireClientSelection = formData.get("requireClientSelection") === "on";
  const selectionType =
    String(formData.get("selectionType") ?? "SINGLE") === "SHARED" ? SelectionType.SHARED : SelectionType.SINGLE;

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

    const selection = await createSelection({
      organizationId: user.organizationId,
      jobId,
      allowanceId: allowanceId || null,
      title,
      description: description || null,
      dueDate: dueDateRaw ? new Date(`${dueDateRaw}T00:00:00Z`) : null,
      category: category || null,
      location: location || null,
      requireClientSelection,
      selectionType,
      options,
    });

    revalidatePath(`/jobs/${jobId}/selections`);
    redirect(`/jobs/${jobId}/selections/${selection.id}`);
  } catch (error) {
    if (error instanceof JobNotFoundError || error instanceof AllowanceNotFoundError) return { error: error.message };
    if (error instanceof Error && error.message.includes("Cannot parse")) return { error: error.message };
    throw error;
  }
}

export async function updateSelectionAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireAppUser();
  const jobId = String(formData.get("jobId") ?? "");
  const selectionId = String(formData.get("selectionId") ?? "");
  const title = String(formData.get("title") ?? "").trim();
  if (!title) return { error: "Title is required." };

  const dueDateRaw = String(formData.get("dueDate") ?? "");
  const selectionType =
    String(formData.get("selectionType") ?? "SINGLE") === "SHARED" ? SelectionType.SHARED : SelectionType.SINGLE;

  try {
    await updateSelection({
      organizationId: user.organizationId,
      selectionId,
      title,
      description: String(formData.get("description") ?? "").trim() || null,
      dueDate: dueDateRaw ? new Date(`${dueDateRaw}T00:00:00Z`) : null,
      category: String(formData.get("category") ?? "").trim() || null,
      location: String(formData.get("location") ?? "").trim() || null,
      requireClientSelection: formData.get("requireClientSelection") === "on",
      selectionType,
      allowanceId: String(formData.get("allowanceId") ?? "") || null,
    });
  } catch (error) {
    if (error instanceof SelectionNotFoundError || error instanceof SelectionAlreadyDecidedError || error instanceof AllowanceNotFoundError) {
      return { error: error.message };
    }
    throw error;
  }

  revalidatePath(`/jobs/${jobId}/selections`);
  revalidatePath(`/jobs/${jobId}/selections/${selectionId}`);
  return { ok: true };
}

export async function addSelectionOptionAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireAppUser();
  const jobId = String(formData.get("jobId") ?? "");
  const selectionId = String(formData.get("selectionId") ?? "");
  const title = String(formData.get("optionTitle") ?? "").trim();
  const priceRaw = String(formData.get("optionPrice") ?? "");
  const clientPriceRaw = String(formData.get("optionClientPrice") ?? "");

  if (!title) return { error: "Choice title is required." };
  if (!priceRaw || !clientPriceRaw) return { error: "Cost and client price are required." };

  try {
    await addSelectionOption(user.organizationId, selectionId, {
      title,
      priceCents: parseDollarsToCents(priceRaw),
      clientPriceCents: parseDollarsToCents(clientPriceRaw),
    });
  } catch (error) {
    if (error instanceof SelectionNotFoundError || error instanceof SelectionAlreadyDecidedError) {
      return { error: error.message };
    }
    if (error instanceof Error && error.message.includes("Cannot parse")) return { error: error.message };
    throw error;
  }

  revalidatePath(`/jobs/${jobId}/selections`);
  revalidatePath(`/jobs/${jobId}/selections/${selectionId}`);
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
  revalidatePath(`/jobs/${jobId}/selections/${selectionId}`);
}
