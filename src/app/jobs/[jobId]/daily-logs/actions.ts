"use server";

import { revalidatePath } from "next/cache";

import { requireAppUser } from "@/lib/auth";
import { createDailyLog, JobNotFoundError } from "@/lib/daily-logs/service";

export interface ActionState {
  readonly error?: string;
  readonly ok?: boolean;
}

export async function createDailyLogAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireAppUser();

  const jobId = String(formData.get("jobId") ?? "");
  const note = String(formData.get("note") ?? "").trim();
  const clientVisible = formData.get("clientVisible") === "on";
  const subVisible = formData.get("subVisible") === "on";

  if (!note) {
    return { error: "Note is required." };
  }

  try {
    await createDailyLog({
      organizationId: user.organizationId,
      jobId,
      authorUserId: user.id,
      note,
      clientVisible,
      subVisible,
    });
  } catch (error) {
    if (error instanceof JobNotFoundError) {
      return { error: error.message };
    }
    throw error;
  }

  revalidatePath(`/jobs/${jobId}/daily-logs`);
  revalidatePath(`/jobs/${jobId}`);
  return { ok: true };
}
