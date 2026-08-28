"use server";

import { revalidatePath } from "next/cache";

import { requireAppUser } from "@/lib/auth";
import { addScheduleItem, createSchedule, JobNotFoundError, ScheduleNotFoundError, snapshotBaseline } from "@/lib/scheduling/service";

export interface ActionState {
  readonly error?: string;
  readonly ok?: boolean;
}

export async function createScheduleAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireAppUser();

  const jobId = String(formData.get("jobId") ?? "");

  try {
    await createSchedule({ organizationId: user.organizationId, jobId });
  } catch (error) {
    if (error instanceof JobNotFoundError) return { error: error.message };
    throw error;
  }

  revalidatePath(`/jobs/${jobId}/schedule`);
  return { ok: true };
}

export async function snapshotBaselineAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireAppUser();

  const jobId = String(formData.get("jobId") ?? "");
  const scheduleId = String(formData.get("scheduleId") ?? "");

  try {
    await snapshotBaseline(user.organizationId, scheduleId);
  } catch (error) {
    if (error instanceof ScheduleNotFoundError) return { error: error.message };
    throw error;
  }

  revalidatePath(`/jobs/${jobId}/schedule`);
  return { ok: true };
}

export async function addScheduleItemAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireAppUser();

  const jobId = String(formData.get("jobId") ?? "");
  const scheduleId = String(formData.get("scheduleId") ?? "");
  const title = String(formData.get("title") ?? "").trim();
  const durationRaw = String(formData.get("durationDays") ?? "1");
  const lagRaw = String(formData.get("lagDays") ?? "0");
  const manualStartDateRaw = String(formData.get("manualStartDate") ?? "");
  const predecessorIds = formData.getAll("predecessorIds").map(String).filter(Boolean);

  if (!title) return { error: "Title is required." };

  const durationDays = Math.round(Number(durationRaw));
  if (!Number.isFinite(durationDays) || durationDays <= 0) return { error: "Duration must be a positive number of days." };

  const lagDays = Math.round(Number(lagRaw || "0"));
  if (!Number.isFinite(lagDays)) return { error: "Lag must be a number of days." };

  try {
    await addScheduleItem({
      organizationId: user.organizationId,
      scheduleId,
      title,
      durationDays,
      predecessorIds,
      lagDays,
      manualStartDate: manualStartDateRaw ? new Date(manualStartDateRaw) : null,
      clientVisible: formData.get("clientVisible") === "on",
      subVisible: formData.get("subVisible") === "on",
    });
  } catch (error) {
    if (error instanceof ScheduleNotFoundError) return { error: error.message };
    throw error;
  }

  revalidatePath(`/jobs/${jobId}/schedule`);
  return { ok: true };
}
