"use server";

import { revalidatePath } from "next/cache";

import { BidPackageStatus } from "@/generated/prisma/enums";
import { generateBidComparisonSummary, AiNotConfiguredError, SummaryGenerationError } from "@/lib/ai/bid-comparison-assistant";
import { requireAppUser } from "@/lib/auth";
import { buildComparisonContextText, computeBidComparison } from "@/lib/bids/comparison";
import {
  acceptBidSubmission,
  BidPackageNotFoundError,
  BidSubmissionAlreadyDecidedError,
  BidSubmissionNotAcceptedError,
  BidSubmissionNotFoundError,
  BidSubmissionNotSubmittedError,
  closeBidPackage,
  declineBidSubmission,
  MissingCostCodeError,
  NoAcceptedSubmissionsError,
  pushBidSubmissionToPurchaseOrder,
} from "@/lib/bids/service";
import { db } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";

export interface ActionState {
  readonly error?: string;
  readonly ok?: boolean;
}

export interface SummaryActionState {
  readonly error?: string;
  readonly summary?: string;
}

function revalidateComparePaths(jobId: string, bidPackageId: string) {
  revalidatePath(`/jobs/${jobId}/bids`);
  revalidatePath(`/jobs/${jobId}/bids/${bidPackageId}/compare`);
}

export async function acceptBidSubmissionOnCompareAction(formData: FormData): Promise<void> {
  const user = await requireAppUser();
  const jobId = String(formData.get("jobId") ?? "");
  const bidPackageId = String(formData.get("bidPackageId") ?? "");
  const bidSubmissionId = String(formData.get("bidSubmissionId") ?? "");

  try {
    await acceptBidSubmission(user.organizationId, bidSubmissionId);
  } catch (error) {
    if (
      error instanceof BidSubmissionNotFoundError ||
      error instanceof BidSubmissionAlreadyDecidedError ||
      error instanceof BidSubmissionNotSubmittedError
    ) {
      return;
    }
    throw error;
  }

  revalidateComparePaths(jobId, bidPackageId);
}

export async function declineBidSubmissionOnCompareAction(formData: FormData): Promise<void> {
  const user = await requireAppUser();
  const jobId = String(formData.get("jobId") ?? "");
  const bidPackageId = String(formData.get("bidPackageId") ?? "");
  const bidSubmissionId = String(formData.get("bidSubmissionId") ?? "");

  try {
    await declineBidSubmission(user.organizationId, bidSubmissionId);
  } catch (error) {
    if (error instanceof BidSubmissionNotFoundError || error instanceof BidSubmissionAlreadyDecidedError) return;
    throw error;
  }

  revalidateComparePaths(jobId, bidPackageId);
}

export async function closeBidPackageAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireAppUser();
  const jobId = String(formData.get("jobId") ?? "");
  const bidPackageId = String(formData.get("bidPackageId") ?? "");
  const statusRaw = String(formData.get("status") ?? "");

  if (statusRaw !== BidPackageStatus.CLOSED && statusRaw !== BidPackageStatus.AWARDED) {
    return { error: "Invalid status." };
  }
  const status = statusRaw as typeof BidPackageStatus.CLOSED | typeof BidPackageStatus.AWARDED;

  try {
    await closeBidPackage({ organizationId: user.organizationId, bidPackageId, status });
  } catch (error) {
    if (error instanceof BidPackageNotFoundError || error instanceof NoAcceptedSubmissionsError) return { error: error.message };
    throw error;
  }

  revalidateComparePaths(jobId, bidPackageId);
  return { ok: true };
}

export async function pushBidToPurchaseOrderAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireAppUser();
  const jobId = String(formData.get("jobId") ?? "");
  const bidPackageId = String(formData.get("bidPackageId") ?? "");
  const bidSubmissionId = String(formData.get("bidSubmissionId") ?? "");
  const poNumber = String(formData.get("poNumber") ?? "").trim();
  const fallbackCostCodeId = String(formData.get("fallbackCostCodeId") ?? "").trim();

  if (!poNumber) return { error: "PO number is required." };

  try {
    await pushBidSubmissionToPurchaseOrder(user.organizationId, bidSubmissionId, poNumber, fallbackCostCodeId || undefined);
  } catch (error) {
    if (
      error instanceof BidSubmissionNotFoundError ||
      error instanceof BidSubmissionNotAcceptedError ||
      error instanceof MissingCostCodeError
    ) {
      return { error: error.message };
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return { error: `Purchase order "${poNumber}" already exists.` };
    }
    throw error;
  }

  revalidateComparePaths(jobId, bidPackageId);
  return { ok: true };
}

export async function generateComparisonSummaryAction(_previous: SummaryActionState, formData: FormData): Promise<SummaryActionState> {
  const user = await requireAppUser();
  const bidPackageId = String(formData.get("bidPackageId") ?? "");

  const bidPackage = await db.bidPackage.findFirst({
    where: { id: bidPackageId, organizationId: user.organizationId },
    include: {
      lineItems: { orderBy: { sortOrder: "asc" } },
      submissions: { include: { vendor: true, lineItems: { orderBy: { sortOrder: "asc" } } } },
    },
  });
  if (!bidPackage) return { error: "Bid package not found." };

  const result = computeBidComparison(
    bidPackage.lineItems.map((line) => ({ id: line.id, title: line.title, unit: line.unit, quantityMilli: line.quantityMilli })),
    bidPackage.submissions.map((submission) => ({
      id: submission.id,
      vendorName: submission.vendor.name,
      status: submission.status,
      totalCents: submission.totalCents,
      notes: submission.notes,
      lineItems: submission.lineItems.map((line) => ({
        bidPackageLineItemId: line.bidPackageLineItemId,
        title: line.title,
        quantityMilli: line.quantityMilli,
        unitCostCents: line.unitCostCents,
      })),
    })),
  );

  try {
    const summary = await generateBidComparisonSummary({
      packageTitle: bidPackage.title,
      contextText: buildComparisonContextText(result),
    });
    return { summary };
  } catch (error) {
    if (error instanceof AiNotConfiguredError || error instanceof SummaryGenerationError) return { error: error.message };
    throw error;
  }
}
