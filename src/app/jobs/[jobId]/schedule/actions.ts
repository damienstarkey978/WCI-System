"use server";

import { revalidatePath } from "next/cache";

import { requireAppUser } from "@/lib/auth";
import {
  addNonWorkingDay,
  addScheduleItem,
  createSchedule,
  deleteNonWorkingDay,
  JobNotFoundError,
  NonWorkingDayExistsError,
  ScheduleItemNotFoundError,
  ScheduleNotFoundError,
  snapshotBaseline,
  updateScheduleItem,
} from "@/lib/scheduling/service";

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

export async function setScheduleItemProgressAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireAppUser();

  const jobId = String(formData.get("jobId") ?? "");
  const itemId = String(formData.get("itemId") ?? "");
  const percent = Number(String(formData.get("percent") ?? ""));
  if (!Number.isFinite(percent) || percent < 0 || percent > 100) return { error: "Enter 0 to 100." };

  try {
    await updateScheduleItem({ organizationId: user.organizationId, itemId, percentCompleteBasisPoints: Math.round(percent * 100) });
  } catch (error) {
    if (error instanceof ScheduleItemNotFoundError) return { error: error.message };
    throw error;
  }

  revalidatePath(`/jobs/${jobId}/schedule`);
  return { ok: true };
}

export async function addWorkdayExceptionAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireAppUser();

  const jobId = String(formData.get("jobId") ?? "");
  const date = String(formData.get("date") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { error: "Pick a date." };

  try {
    await addNonWorkingDay(user.organizationId, date, reason || null);
  } catch (error) {
    if (error instanceof NonWorkingDayExistsError) return { error: error.message };
    throw error;
  }

  revalidatePath(`/jobs/${jobId}/schedule`);
  return { ok: true };
}

export async function deleteWorkdayExceptionAction(formData: FormData): Promise<void> {
  const user = await requireAppUser();
  const jobId = String(formData.get("jobId") ?? "");
  await deleteNonWorkingDay(user.organizationId, String(formData.get("id") ?? ""));
  revalidatePath(`/jobs/${jobId}/schedule`);
}
