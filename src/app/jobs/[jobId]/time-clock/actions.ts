"use server";

import { revalidatePath } from "next/cache";

import { requireAppUser } from "@/lib/auth";
import {
  approveEntry,
  clockIn,
  CostCodeNotFoundError,
  EntryNotFoundError,
  InsufficientRoleError,
  JobNotFoundError,
  JobNotOpenError,
  NoLaborRateError,
  rejectEntry,
  UserAlreadyClockedInError,
} from "@/lib/time-clock/service";

export interface ActionState {
  readonly error?: string;
  readonly ok?: boolean;
}

export async function clockInAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireAppUser();
  const jobId = String(formData.get("jobId") ?? "");
  const userId = String(formData.get("userId") ?? "") || user.id;
  const costCodeId = String(formData.get("costCodeId") ?? "");

  if (!costCodeId) return { error: "Cost code is required." };

  try {
    await clockIn({
      organizationId: user.organizationId,
      userId,
      jobId,
      costCodeId,
      ...(userId === user.id ? {} : { clockedInByUserId: user.id }),
    });
  } catch (error) {
    if (
      error instanceof JobNotFoundError ||
      error instanceof CostCodeNotFoundError ||
      error instanceof JobNotOpenError ||
      error instanceof NoLaborRateError ||
      error instanceof UserAlreadyClockedInError
    ) {
      return { error: error.message };
    }
    throw error;
  }

  revalidatePath(`/jobs/${jobId}/time-clock`);
  return { ok: true };
}

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
