"use server";

import { revalidatePath } from "next/cache";

import { requireAppUser } from "@/lib/auth";
import {
  addNonWorkingDay,
  addScheduleItem,
  createSchedulePhase,
  deleteSchedulePhase,
  SchedulePhaseNameTakenError,
  SchedulePhaseNotFoundError,
  setScheduleFlags,
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

function parseScheduleItemFields(formData: FormData) {
  const title = String(formData.get("title") ?? "").trim();
  const durationRaw = String(formData.get("durationDays") ?? "1");
  const lagRaw = String(formData.get("lagDays") ?? "0");
  const manualStartDateRaw = String(formData.get("manualStartDate") ?? "");
  const predecessorIds = formData
    .getAll("predecessorIds")
    .map(String)
    .filter(Boolean);
  const assigneeUserIds = formData.getAll("assigneeUserIds").map(String).filter(Boolean);
  const reminderRaw = String(formData.get("reminderDays") ?? "");
  const percentRaw = String(formData.get("percent") ?? "0");
  const tags = String(formData.get("tags") ?? "")
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
  const phaseIdRaw = String(formData.get("phaseId") ?? "");
  const complete = formData.get("complete") === "on";

  const durationDays = Math.round(Number(durationRaw));
  const lagDays = Math.round(Number(lagRaw || "0"));
  const percent = complete ? 100 : Number(percentRaw);
  const reminderDays = reminderRaw === "" ? null : Math.round(Number(reminderRaw));

  return {
    title,
    durationDays,
    lagDays,
    percent,
    reminderDays,
    predecessorIds,
    assigneeUserIds,
    tags,
    phaseId: phaseIdRaw || null,
    manualStartDate: manualStartDateRaw ? new Date(`${manualStartDateRaw}T00:00:00Z`) : null,
    displayColor: String(formData.get("displayColor") ?? "").trim() || null,
    isHourly: formData.get("isHourly") === "on",
    clientVisible: formData.get("clientVisible") === "on",
    subVisible: formData.get("subVisible") === "on",
    showOnGantt: formData.get("showOnGantt") === "on",
    notesInternal: String(formData.get("notesInternal") ?? "").trim() || null,
    notesSubs: String(formData.get("notesSubs") ?? "").trim() || null,
    notesClient: String(formData.get("notesClient") ?? "").trim() || null,
  };
}

/** Create or update a schedule item from the Buildertrend-style Schedule Item modal. */
export async function saveScheduleItemAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireAppUser();

  const jobId = String(formData.get("jobId") ?? "");
  const scheduleId = String(formData.get("scheduleId") ?? "");
  const itemId = String(formData.get("itemId") ?? "");
  const fields = parseScheduleItemFields(formData);

  if (!fields.title) return { error: "Title is required." };
  if (!Number.isFinite(fields.durationDays) || fields.durationDays <= 0) return { error: "Work days must be a positive number." };
  if (!Number.isFinite(fields.lagDays)) return { error: "Lag must be a number of days." };
  if (!Number.isFinite(fields.percent) || fields.percent < 0 || fields.percent > 100) return { error: "Progress must be 0 to 100." };
  if (fields.reminderDays !== null && (!Number.isFinite(fields.reminderDays) || fields.reminderDays < 0)) {
    return { error: "Reminder must be a number of days." };
  }
  if (!fields.manualStartDate || Number.isNaN(fields.manualStartDate.getTime())) return { error: "Start date is required." };

  const payload = {
    title: fields.title,
    durationDays: fields.durationDays,
    predecessorIds: fields.predecessorIds,
    lagDays: fields.lagDays,
    manualStartDate: fields.manualStartDate,
    clientVisible: fields.clientVisible,
    subVisible: fields.subVisible,
    showOnGantt: fields.showOnGantt,
    assigneeUserIds: fields.assigneeUserIds,
    displayColor: fields.displayColor,
    isHourly: fields.isHourly,
    reminderDays: fields.reminderDays,
    tags: fields.tags,
    notesInternal: fields.notesInternal,
    notesSubs: fields.notesSubs,
    notesClient: fields.notesClient,
    percentCompleteBasisPoints: Math.round(fields.percent * 100),
    phaseId: fields.phaseId,
  };

  try {
    if (itemId) {
      await updateScheduleItem({ organizationId: user.organizationId, itemId, ...payload });
    } else {
      await addScheduleItem({ organizationId: user.organizationId, scheduleId, ...payload });
    }
  } catch (error) {
    if (
      error instanceof ScheduleNotFoundError ||
      error instanceof ScheduleItemNotFoundError ||
      error instanceof SchedulePhaseNotFoundError
    ) {
      return { error: error.message };
    }
    throw error;
  }

  revalidatePath(`/jobs/${jobId}/schedule`);
  return { ok: true };
}

export async function addScheduleItemAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  return saveScheduleItemAction(_previous, formData);
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

export async function createPhaseAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireAppUser();
  const jobId = String(formData.get("jobId") ?? "");
  const scheduleId = String(formData.get("scheduleId") ?? "");

  try {
    await createSchedulePhase(user.organizationId, scheduleId, String(formData.get("name") ?? ""));
  } catch (error) {
    if (error instanceof SchedulePhaseNameTakenError || error instanceof ScheduleNotFoundError) return { error: error.message };
    if (error instanceof Error && error.message === "Phase name is required.") return { error: error.message };
    throw error;
  }

  revalidatePath(`/jobs/${jobId}/schedule`);
  return { ok: true };
}

export async function deletePhaseAction(formData: FormData): Promise<void> {
  const user = await requireAppUser();
  const jobId = String(formData.get("jobId") ?? "");
  try {
    await deleteSchedulePhase(user.organizationId, String(formData.get("phaseId") ?? ""));
  } catch (error) {
    if (!(error instanceof SchedulePhaseNotFoundError)) throw error;
  }
  revalidatePath(`/jobs/${jobId}/schedule`);
}

export async function setItemPhaseAction(formData: FormData): Promise<void> {
  const user = await requireAppUser();
  const jobId = String(formData.get("jobId") ?? "");
  try {
    await updateScheduleItem({
      organizationId: user.organizationId,
      itemId: String(formData.get("itemId") ?? ""),
      phaseId: String(formData.get("phaseId") ?? "") || null,
    });
  } catch (error) {
    if (!(error instanceof SchedulePhaseNotFoundError) && !(error instanceof ScheduleItemNotFoundError)) throw error;
  }
  revalidatePath(`/jobs/${jobId}/schedule`);
}

export async function setScheduleFlagAction(formData: FormData): Promise<void> {
  const user = await requireAppUser();
  const jobId = String(formData.get("jobId") ?? "");
  const field = String(formData.get("field") ?? "");
  if (field !== "isOnline" && field !== "isDraft") return;

  try {
    await setScheduleFlags(user.organizationId, String(formData.get("scheduleId") ?? ""), { [field]: formData.get("value") === "true" });
  } catch (error) {
    if (!(error instanceof ScheduleNotFoundError)) throw error;
  }
  revalidatePath(`/jobs/${jobId}/schedule`);
}
