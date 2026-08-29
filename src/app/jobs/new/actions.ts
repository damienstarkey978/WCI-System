"use server";

import { redirect } from "next/navigation";

import { Prisma } from "@/generated/prisma/client";
import { ContractType, JobStatus, UserRole } from "@/generated/prisma/enums";
import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { emitEvent } from "@/lib/webhooks";

export interface ActionState {
  readonly error?: string;
}

const INITIAL: ActionState = {};

/**
 * Buildertrend's "New Job From Scratch" creates a bare job then drops you straight
 * into its edit tabs to fill in the rest — same fields, same page, just an unsaved
 * "Draft" state at first. This does the same: create with just the required fields,
 * then redirect into /jobs/[jobId]/settings (src/app/jobs/[jobId]/settings) rather
 * than duplicating that whole form here.
 */
export async function createJobFromScratchAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireRole(UserRole.ADMIN, UserRole.PM);

  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { error: "Job title is required." };

  const contractType = String(formData.get("contractType") ?? "");
  if (contractType !== ContractType.FIXED_PRICE && contractType !== ContractType.OPEN_BOOK) {
    return { error: "Choose a contract type." };
  }

  const jobType = String(formData.get("jobType") ?? "").trim();

  let jobId: string;
  try {
    const job = await db.job.create({
      data: {
        organizationId: user.organizationId,
        name,
        contractType,
        status: JobStatus.PRE_SALE,
        customFields: jobType ? { jobType } : undefined,
      },
    });
    jobId = job.id;

    await db.jobStatusEvent.create({ data: { jobId: job.id, from: null, to: JobStatus.PRE_SALE, actorUserId: user.id } });
    await emitEvent(user.organizationId, "job.created", { jobId: job.id, prefix: job.prefix, name: job.name });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return { error: "A job with that prefix already exists." };
    }
    throw error;
  }

  redirect(`/jobs/${jobId}/settings`);
}

export const INITIAL_ACTION_STATE = INITIAL;
