-- AlterTable
ALTER TABLE "Estimate" ADD COLUMN "pendingProposalDraft" JSONB;

-- AlterTable
ALTER TABLE "ProposalDraftJob" ADD COLUMN "resultEstimateId" TEXT;
