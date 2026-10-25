"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireAppUser } from "@/lib/auth";
import { parseDrawsText, parseSectionsText, proposalTemplateContentSchema } from "@/lib/proposal-templates/content";
import {
  createProposalTemplate,
  deleteProposalTemplate,
  ProposalTemplateNotFoundError,
  updateProposalTemplate,
} from "@/lib/proposal-templates/service";

export interface TemplateActionState {
  readonly error?: string;
  readonly ok?: boolean;
}

function readContent(formData: FormData) {
  return proposalTemplateContentSchema.safeParse({
    name: String(formData.get("name") ?? ""),
    description: String(formData.get("description") ?? "") || null,
    coverMessage: String(formData.get("coverMessage") ?? "") || null,
    sections: parseSectionsText(String(formData.get("sections") ?? "")),
    draws: parseDrawsText(String(formData.get("draws") ?? "")),
  });
}

export async function createTemplateAction(_previous: TemplateActionState, formData: FormData): Promise<TemplateActionState> {
  const user = await requireAppUser();
  const parsed = readContent(formData);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the template fields." };

  const template = await createProposalTemplate(user.organizationId, parsed.data);
  revalidatePath("/leads/proposal-templates");
  redirect(`/leads/proposal-templates/${template.id}`);
}

export async function updateTemplateAction(_previous: TemplateActionState, formData: FormData): Promise<TemplateActionState> {
  const user = await requireAppUser();
  const templateId = String(formData.get("templateId") ?? "");
  const parsed = readContent(formData);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the template fields." };

  try {
    await updateProposalTemplate(user.organizationId, templateId, parsed.data);
  } catch (error) {
    if (error instanceof ProposalTemplateNotFoundError) return { error: error.message };
    throw error;
  }

  revalidatePath("/leads/proposal-templates");
  revalidatePath(`/leads/proposal-templates/${templateId}`);
  return { ok: true };
}

export async function deleteTemplateAction(formData: FormData): Promise<void> {
  const user = await requireAppUser();
  const templateId = String(formData.get("templateId") ?? "");
  try {
    await deleteProposalTemplate(user.organizationId, templateId);
  } catch (error) {
    if (!(error instanceof ProposalTemplateNotFoundError)) throw error;
  }
  revalidatePath("/leads/proposal-templates");
  redirect("/leads/proposal-templates");
}
