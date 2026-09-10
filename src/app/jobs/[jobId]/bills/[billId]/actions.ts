"use server";

import { revalidatePath } from "next/cache";

import type { BillApprovalStatus } from "@/generated/prisma/enums";
import { requireAppUser } from "@/lib/auth";
import {
  ApprovalsIncompleteError,
  ApproverNotAssignedError,
  approveBillAs,
  claimFromInbox,
  setBillApprovers,
} from "@/lib/bills/intake";
import {
  LienWaiverAlreadyReleasedError,
  applyLienWaiver,
  releaseLienWaiver,
} from "@/lib/bills/lien-waivers";
import { BillNotFoundError, IllegalBillTransitionError, updateBillStatus } from "@/lib/bills/service";

export interface BillActionState {
  readonly error?: string;
  readonly ok?: boolean;
}

/**
 * Every bill action funnels through here so the org scoping, the error translation,
 * and the revalidation are identical across all of them. The known service errors
 * become messages the office can act on; anything unrecognized still throws, since
 * swallowing an unexpected failure on a money screen is worse than a stack trace.
 */
async function run(
  jobId: string,
  billId: string,
  work: (organizationId: string, userId: string) => Promise<unknown>,
): Promise<BillActionState> {
  const user = await requireAppUser();
  try {
    await work(user.organizationId, user.id);
  } catch (error) {
    if (
      error instanceof BillNotFoundError ||
      error instanceof IllegalBillTransitionError ||
      error instanceof ApprovalsIncompleteError ||
      error instanceof ApproverNotAssignedError ||
      error instanceof LienWaiverAlreadyReleasedError
    ) {
      return { error: error.message };
    }
    throw error;
  }
  revalidatePath(`/jobs/${jobId}/bills`);
  revalidatePath(`/jobs/${jobId}/bills/${billId}`);
  return { ok: true };
}

export async function setBillStatusAction(_previous: BillActionState, formData: FormData): Promise<BillActionState> {
  const jobId = String(formData.get("jobId") ?? "");
  const billId = String(formData.get("billId") ?? "");
  const status = String(formData.get("status") ?? "") as BillApprovalStatus;
  return run(jobId, billId, (organizationId) => updateBillStatus(organizationId, billId, status));
}

export async function claimFromInboxAction(_previous: BillActionState, formData: FormData): Promise<BillActionState> {
  const jobId = String(formData.get("jobId") ?? "");
  const billId = String(formData.get("billId") ?? "");
  return run(jobId, billId, (organizationId, userId) => claimFromInbox({ organizationId, billId, userId }));
}

export async function setApproversAction(_previous: BillActionState, formData: FormData): Promise<BillActionState> {
  const jobId = String(formData.get("jobId") ?? "");
  const billId = String(formData.get("billId") ?? "");
  const approverUserIds = formData.getAll("approverUserIds").map(String).filter(Boolean);
  return run(jobId, billId, (organizationId) => setBillApprovers({ organizationId, billId, approverUserIds }));
}

/** Sign off as the current user. Deliberately can't sign on someone else's behalf. */
export async function approveAsMeAction(_previous: BillActionState, formData: FormData): Promise<BillActionState> {
  const jobId = String(formData.get("jobId") ?? "");
  const billId = String(formData.get("billId") ?? "");
  const note = String(formData.get("note") ?? "").trim() || null;
  return run(jobId, billId, (organizationId, userId) =>
    approveBillAs({ organizationId, billId, approverUserId: userId, note }),
  );
}

export async function applyLienWaiverAction(_previous: BillActionState, formData: FormData): Promise<BillActionState> {
  const jobId = String(formData.get("jobId") ?? "");
  const billId = String(formData.get("billId") ?? "");
  const templateName = String(formData.get("templateName") ?? "");
  return run(jobId, billId, (organizationId) => applyLienWaiver({ organizationId, billId, templateName }));
}

export async function releaseLienWaiverAction(_previous: BillActionState, formData: FormData): Promise<BillActionState> {
  const jobId = String(formData.get("jobId") ?? "");
  const billId = String(formData.get("billId") ?? "");
  const lienWaiverId = String(formData.get("lienWaiverId") ?? "");
  return run(jobId, billId, (organizationId) => releaseLienWaiver({ organizationId, lienWaiverId }));
}
