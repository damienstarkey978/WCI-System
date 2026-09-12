-- CreateTable
CREATE TABLE "ProposalDraw" (
    "id" TEXT NOT NULL,
    "proposalId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "pctOfContractBasisPoints" INTEGER NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProposalDraw_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProposalDraw_proposalId_sortOrder_idx" ON "ProposalDraw"("proposalId", "sortOrder");

-- AddForeignKey
ALTER TABLE "ProposalDraw" ADD CONSTRAINT "ProposalDraw_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "Proposal"("id") ON DELETE CASCADE ON UPDATE CASCADE;
