"use server";

import { revalidatePath } from "next/cache";

import { Prisma } from "@/generated/prisma/client";
import { ContractType, JobStatus } from "@/generated/prisma/enums";
import { requireAppUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { JobStatusTransitionError } from "@/lib/job-status";
import { JobNotFoundError, transitionJobStatus } from "@/lib/jobs";

export interface ActionState {
  readonly error?: string;
  readonly ok?: boolean;
}

/**
 * Server Actions are POST requests to the page they live on, so src/proxy.ts is not a
 * reliable gate for them — every action re-establishes the actor itself.
 */
export async function createJobAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireAppUser();

  const name = String(formData.get("name") ?? "").trim();
  const contractTypeRaw = String(formData.get("contractType") ?? "");
  const prefix = String(formData.get("prefix") ?? "").trim();
  const addressLine1 = String(formData.get("addressLine1") ?? "").trim();
  const city = String(formData.get("city") ?? "").trim();

  if (!name) {
    return { error: "Job name is required." };
  }
  if (contractTypeRaw !== ContractType.FIXED_PRICE && contractTypeRaw !== ContractType.OPEN_BOOK) {
    return { error: "Choose a contract type." };
  }

  try {
    const job = await db.job.create({
      data: {
        organizationId: user.organizationId,
        name,
        contractType: contractTypeRaw,
        status: JobStatus.PRE_SALE,
        prefix: prefix || null,
        addressLine1: addressLine1 || null,
        city: city || null,
      },
    });

    await db.jobStatusEvent.create({
      data: { jobId: job.id, from: null, to: JobStatus.PRE_SALE, actorUserId: user.id },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return { error: `A job with prefix "${prefix}" already exists.` };
    }
    throw error;
  }

  revalidatePath("/admin/jobs");
  return { ok: true };
}

export async function transitionJobStatusAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireAppUser();

  const jobId = String(formData.get("jobId") ?? "");
  const to = String(formData.get("status") ?? "");

  if (!jobId || !(to in JobStatus)) {
    return { error: "Invalid transition request." };
  }

  try {
    await transitionJobStatus({
      jobId,
      organizationId: user.organizationId,
      to: to as JobStatus,
      actor: { kind: "user", userId: user.id, role: user.role },
    });
  } catch (error) {
    if (error instanceof JobStatusTransitionError || error instanceof JobNotFoundError) {
      return { error: error.message };
    }
    throw error;
  }

  revalidatePath("/admin/jobs");
  return { ok: true };
}
