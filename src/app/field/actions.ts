"use server";

/**
 * Server Actions for the field PWA (Phase 7). These are called two ways: directly as
 * plain async functions from the time-clock/daily-log client components (the normal
 * online path), and again later with the exact same input by field-sync-manager.tsx
 * when replaying a queued offline action. Either way they authenticate the same way
 * every other page under /field does — the signed-in staff Clerk session via
 * requireAppUser() — never an ApiKey; the agent-facing /api/v1 surface is a
 * completely separate auth world (CLAUDE.md 2.1) that this UI does not touch.
 *
 * Every expected domain error is returned as { ok: false, error } rather than thrown:
 * Next.js redacts thrown Server Action errors down to a generic digest in production,
 * which would hide messages like "Already clocked in" that the field UI needs to show
 * verbatim. This mirrors src/app/admin/jobs/actions.ts's ActionState pattern.
 */

import { revalidatePath } from "next/cache";

import type { GpsPoint } from "@/lib/time-clock/geofence";
import { requireAppUser } from "@/lib/auth";
import { createDailyLog, JobNotFoundError as DailyLogJobNotFoundError } from "@/lib/daily-logs/service";
import { OpenBreakError } from "@/lib/time-clock/hours";
import {
  clockIn,
  clockOut,
  CostCodeNotFoundError,
  EntryAlreadyClockedOutError,
  EntryNotFoundError,
  JobNotFoundError,
  JobNotOpenError,
  NoLaborRateError,
  NoOpenBreakError,
  OpenBreakExistsError,
  startBreak,
  endBreak,
  UserAlreadyClockedInError,
} from "@/lib/time-clock/service";

export type FieldActionResult<T> = { readonly ok: true; readonly data: T } | { readonly ok: false; readonly error: string };

function fail(error: unknown): { ok: false; error: string } {
  if (error instanceof Error) return { ok: false, error: error.message };
  throw error;
}

export interface ClockInActionInput {
  readonly jobId: string;
  readonly costCodeId: string;
  readonly gps?: GpsPoint;
}

export async function clockInAction(input: ClockInActionInput): Promise<FieldActionResult<{ entryId: string }>> {
  const user = await requireAppUser();
  try {
    const entry = await clockIn({
      organizationId: user.organizationId,
      userId: user.id,
      jobId: input.jobId,
      costCodeId: input.costCodeId,
      gps: input.gps,
    });
    revalidatePath("/field/time-clock");
    return { ok: true, data: { entryId: entry.id } };
  } catch (error) {
    if (
      error instanceof JobNotFoundError ||
      error instanceof JobNotOpenError ||
      error instanceof CostCodeNotFoundError ||
      error instanceof NoLaborRateError ||
      error instanceof UserAlreadyClockedInError
    ) {
      return fail(error);
    }
    throw error;
  }
}

export interface ClockOutActionInput {
  readonly entryId: string;
  readonly gps?: GpsPoint;
}

export async function clockOutAction(input: ClockOutActionInput): Promise<FieldActionResult<{ entryId: string }>> {
  const user = await requireAppUser();
  try {
    const entry = await clockOut({ organizationId: user.organizationId, entryId: input.entryId, gps: input.gps });
    revalidatePath("/field/time-clock");
    return { ok: true, data: { entryId: entry.id } };
  } catch (error) {
    if (error instanceof EntryNotFoundError || error instanceof EntryAlreadyClockedOutError || error instanceof OpenBreakError) {
      return fail(error);
    }
    throw error;
  }
}

export async function startBreakAction(input: { readonly entryId: string }): Promise<FieldActionResult<{ entryId: string }>> {
  const user = await requireAppUser();
  try {
    await startBreak(user.organizationId, input.entryId);
    revalidatePath("/field/time-clock");
    return { ok: true, data: { entryId: input.entryId } };
  } catch (error) {
    if (error instanceof EntryNotFoundError || error instanceof EntryAlreadyClockedOutError || error instanceof OpenBreakExistsError) {
      return fail(error);
    }
    throw error;
  }
}

export async function endBreakAction(input: { readonly entryId: string }): Promise<FieldActionResult<{ entryId: string }>> {
  const user = await requireAppUser();
  try {
    await endBreak(user.organizationId, input.entryId);
    revalidatePath("/field/time-clock");
    return { ok: true, data: { entryId: input.entryId } };
  } catch (error) {
    if (error instanceof EntryNotFoundError || error instanceof NoOpenBreakError) {
      return fail(error);
    }
    throw error;
  }
}

export interface SubmitDailyLogActionInput {
  readonly jobId: string;
  readonly note: string;
}

export async function submitDailyLogAction(input: SubmitDailyLogActionInput): Promise<FieldActionResult<{ dailyLogId: string }>> {
  const user = await requireAppUser();
  try {
    const dailyLog = await createDailyLog({
      organizationId: user.organizationId,
      jobId: input.jobId,
      authorUserId: user.id,
      note: input.note,
    });
    revalidatePath("/field/daily-log");
    return { ok: true, data: { dailyLogId: dailyLog.id } };
  } catch (error) {
    if (error instanceof DailyLogJobNotFoundError) return fail(error);
    throw error;
  }
}
