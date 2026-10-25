"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { ContractType, LeadStage } from "@/generated/prisma/enums";
import { requireAppUser } from "@/lib/auth";
import {
  ClientNotFoundForLeadError,
  convertLeadToJob,
  createLead,
  LeadAlreadyConvertedError,
  LeadNotFoundError,
  updateLeadDetails,
  updateLeadStage,
} from "@/lib/crm/service";
import { importLeads, InvalidLeadSheetError, parseLeadSheet, type LeadImportSummary } from "@/lib/crm/import";
import { MoneyError, parseDollarsToCents } from "@/lib/money";

export interface ActionState {
  readonly error?: string;
  readonly ok?: boolean;
}

const STAGES = Object.values(LeadStage) as readonly string[];

function parseTags(raw: string): readonly string[] {
  return raw
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
}

export async function createLeadAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireAppUser();

  const title = String(formData.get("title") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();
  const contactClientId = String(formData.get("contactClientId") ?? "").trim();
  const source = String(formData.get("source") ?? "").trim();
  const confidenceRaw = String(formData.get("confidencePercent") ?? "").trim();
  const projectedSalesDateRaw = String(formData.get("projectedSalesDate") ?? "").trim();
  const revenueMinRaw = String(formData.get("estimatedRevenueMin") ?? "").trim();
  const revenueMaxRaw = String(formData.get("estimatedRevenueMax") ?? "").trim();
  const projectType = String(formData.get("projectType") ?? "").trim();
  const tagsRaw = String(formData.get("tags") ?? "").trim();

  if (!title) {
    return { error: "Title is required." };
  }

  try {
    await createLead({
      organizationId: user.organizationId,
      title,
      // A contact is optional at creation (matches the "Add a client contact"
      // empty state being skippable) — Lead.name still can't be null, so fall
      // back to the title until a real contact is added.
      name: name || title,
      email: email || null,
      phone: phone || null,
      contactClientId: contactClientId || null,
      source: source || null,
      confidencePercent: confidenceRaw ? Math.max(0, Math.min(100, Number(confidenceRaw))) : 0,
      projectedSalesDate: projectedSalesDateRaw ? new Date(projectedSalesDateRaw) : null,
      estimatedRevenueMinCents: revenueMinRaw ? parseDollarsToCents(revenueMinRaw) : null,
      estimatedRevenueMaxCents: revenueMaxRaw ? parseDollarsToCents(revenueMaxRaw) : null,
      projectType: projectType || null,
      tags: tagsRaw ? parseTags(tagsRaw) : [],
    });
  } catch (error) {
    if (error instanceof MoneyError) return { error: error.message };
    if (error instanceof ClientNotFoundForLeadError) return { error: error.message };
    throw error;
  }

  revalidatePath("/leads");
  return { ok: true };
}

export async function updateLeadDetailsAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireAppUser();

  const leadId = String(formData.get("leadId") ?? "");
  const title = String(formData.get("title") ?? "").trim();
  const confidenceRaw = String(formData.get("confidencePercent") ?? "").trim();
  const projectedSalesDateRaw = String(formData.get("projectedSalesDate") ?? "").trim();
  const revenueMinRaw = String(formData.get("estimatedRevenueMin") ?? "").trim();
  const revenueMaxRaw = String(formData.get("estimatedRevenueMax") ?? "").trim();
  const projectType = String(formData.get("projectType") ?? "").trim();
  const tagsRaw = String(formData.get("tags") ?? "").trim();

  try {
    await updateLeadDetails(user.organizationId, leadId, {
      title: title || null,
      confidencePercent: confidenceRaw ? Math.max(0, Math.min(100, Number(confidenceRaw))) : 0,
      projectedSalesDate: projectedSalesDateRaw ? new Date(projectedSalesDateRaw) : null,
      estimatedRevenueMinCents: revenueMinRaw ? parseDollarsToCents(revenueMinRaw) : null,
      estimatedRevenueMaxCents: revenueMaxRaw ? parseDollarsToCents(revenueMaxRaw) : null,
      projectType: projectType || null,
      tags: tagsRaw ? parseTags(tagsRaw) : [],
    });
  } catch (error) {
    if (error instanceof LeadNotFoundError) return { error: error.message };
    if (error instanceof MoneyError) return { error: error.message };
    throw error;
  }

  revalidatePath(`/leads/${leadId}`);
  revalidatePath("/leads");
  return { ok: true };
}

export async function updateLeadStageAction(formData: FormData): Promise<void> {
  const user = await requireAppUser();

  const leadId = String(formData.get("leadId") ?? "");
  const stage = String(formData.get("stage") ?? "");
  if (!STAGES.includes(stage)) return;

  try {
    await updateLeadStage(user.organizationId, leadId, stage as LeadStage);
  } catch (error) {
    if (error instanceof LeadNotFoundError) return;
    throw error;
  }

  revalidatePath("/leads");
}

export async function convertLeadAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireAppUser();

  const leadId = String(formData.get("leadId") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const contractTypeRaw = String(formData.get("contractType") ?? "");

  if (!name) {
    return { error: "Job name is required." };
  }
  if (contractTypeRaw !== ContractType.FIXED_PRICE && contractTypeRaw !== ContractType.OPEN_BOOK) {
    return { error: "Choose a contract type." };
  }

  let jobId: string;
  try {
    const result = await convertLeadToJob(user.organizationId, leadId, { name, contractType: contractTypeRaw });
    jobId = result.job.id;
  } catch (error) {
    if (error instanceof LeadNotFoundError || error instanceof LeadAlreadyConvertedError) {
      return { error: error.message };
    }
    throw error;
  }

  redirect(`/jobs/${jobId}`);
}

export interface ImportLeadsState {
  readonly error?: string;
  readonly summary?: LeadImportSummary;
}

export async function importLeadsAction(_previous: ImportLeadsState, formData: FormData): Promise<ImportLeadsState> {
  const user = await requireAppUser();

  const file = formData.get("sheet");
  if (!(file instanceof File) || file.size === 0) return { error: "Choose a CSV file to import." };
  if (/\.xlsx?$/i.test(file.name)) {
    return { error: "That's an Excel file. Open it in Excel (or Numbers) and use File, Save As or Export, CSV, then upload the CSV." };
  }

  try {
    const summary = await importLeads(user.organizationId, parseLeadSheet(await file.text()));
    revalidatePath("/leads");
    return { summary };
  } catch (error) {
    if (error instanceof InvalidLeadSheetError) return { error: error.message };
    throw error;
  }
}
