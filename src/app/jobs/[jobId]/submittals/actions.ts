"use server";

import { revalidatePath } from "next/cache";

import { requireAppUser } from "@/lib/auth";
import { createSubmittal, JobNotFoundError } from "@/lib/submittals/service";

export interface ActionState {
  readonly error?: string;
  readonly ok?: boolean;
}

export async function createSubmittalAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireAppUser();

  const jobId = String(formData.get("jobId") ?? "");
  const title = String(formData.get("title") ?? "").trim();
  const type = String(formData.get("type") ?? "MATERIAL_SPEC") === "SHOP_DRAWING" ? "SHOP_DRAWING" : "MATERIAL_SPEC";
  const documentUrl = String(formData.get("documentUrl") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim();

  if (!title) return { error: "Title is required." };
  if (!documentUrl) return { error: "A document link is required." };

  try {
    await createSubmittal({ organizationId: user.organizationId, jobId, title, type, documentUrl, notes: notes || null });
  } catch (error) {
    if (error instanceof JobNotFoundError) return { error: error.message };
    throw error;
  }

  revalidatePath(`/jobs/${jobId}/submittals`);
  return { ok: true };
}
