-- Phase 16: Proposal multi-option support (task #116) — a Proposal moves from a
-- single Estimate to up to 5 ProposalOptions, each wrapping its own Estimate, plus
-- branding fields and free-text client feedback. Existing proposals are backfilled
-- into a single "Option 1" so nothing currently DRAFT/SENT/ACCEPTED loses its price.

-- CreateTable
CREATE TABLE "ProposalOption" (
    "id" TEXT NOT NULL,
    "proposalId" TEXT NOT NULL,
    "estimateId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProposalOption_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProposalOption_proposalId_sortOrder_idx" ON "ProposalOption"("proposalId", "sortOrder");

-- AddForeignKey
ALTER TABLE "ProposalOption" ADD CONSTRAINT "ProposalOption_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "Proposal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProposalOption" ADD CONSTRAINT "ProposalOption_estimateId_fkey" FOREIGN KEY ("estimateId") REFERENCES "Estimate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AlterTable: new columns first, estimateId dropped only after the backfill below.
ALTER TABLE "Proposal" ADD COLUMN     "accentColor" TEXT,
ADD COLUMN     "clientFeedback" TEXT,
ADD COLUMN     "clientFeedbackAt" TIMESTAMP(3),
ADD COLUMN     "logoUrl" TEXT,
ADD COLUMN     "selectedOptionId" TEXT;

-- Data migration: one ProposalOption per existing Proposal, carrying its old
-- estimateId forward, then point the proposal at it as the (only, so far) selected
-- option — an ACCEPTED/DECLINED proposal already has exactly one meaningful price,
-- and a DRAFT/SENT one behaves exactly as before until a second option is added.
INSERT INTO "ProposalOption" ("id", "proposalId", "estimateId", "label", "sortOrder", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, "id", "estimateId", 'Option 1', 0, "createdAt", "updatedAt"
FROM "Proposal";

UPDATE "Proposal" p
SET "selectedOptionId" = po."id"
FROM "ProposalOption" po
WHERE po."proposalId" = p."id";

-- DropForeignKey
ALTER TABLE "Proposal" DROP CONSTRAINT "Proposal_estimateId_fkey";

-- AlterTable
ALTER TABLE "Proposal" DROP COLUMN "estimateId";

-- CreateIndex
CREATE UNIQUE INDEX "Proposal_selectedOptionId_key" ON "Proposal"("selectedOptionId");

-- AddForeignKey
ALTER TABLE "Proposal" ADD CONSTRAINT "Proposal_selectedOptionId_fkey" FOREIGN KEY ("selectedOptionId") REFERENCES "ProposalOption"("id") ON DELETE SET NULL ON UPDATE CASCADE;
