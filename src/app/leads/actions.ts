"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { ContractType, LeadStage } from "@/generated/prisma/enums";
import { requireAppUser } from "@/lib/auth";
import { convertLeadToJob, createLead, LeadAlreadyConvertedError, LeadNotFoundError, updateLeadStage } from "@/lib/crm/service";

export interface ActionState {
  readonly error?: string;
  readonly ok?: boolean;
}

const STAGES = Object.values(LeadStage) as readonly string[];

export async function createLeadAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireAppUser();

  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();
  const source = String(formData.get("source") ?? "").trim();

  if (!name) {
    return { error: "Name is required." };
  }

  await createLead({
    organizationId: user.organizationId,
    name,
    email: email || null,
    phone: phone || null,
    source: source || null,
  });

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
