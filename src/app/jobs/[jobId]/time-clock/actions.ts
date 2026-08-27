"use server";

import { revalidatePath } from "next/cache";

import { requireAppUser } from "@/lib/auth";
import { approveEntry, EntryNotFoundError, InsufficientRoleError, rejectEntry } from "@/lib/time-clock/service";

export async function reviewTimeClockEntryAction(formData: FormData): Promise<void> {
  const user = await requireAppUser();

  const jobId = String(formData.get("jobId") ?? "");
  const entryId = String(formData.get("entryId") ?? "");
  const decision = String(formData.get("decision") ?? "");

  try {
    const input = { organizationId: user.organizationId, entryId, approverUserId: user.id, approverRole: user.role };
    if (decision === "approve") {
      await approveEntry(input);
    } else if (decision === "reject") {
      await rejectEntry(input);
    }
  } catch (error) {
    if (error instanceof EntryNotFoundError || error instanceof InsufficientRoleError) return;
    throw error;
  }

  revalidatePath(`/jobs/${jobId}/time-clock`);
}
