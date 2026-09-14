-- CreateEnum
CREATE TYPE "ProposalDraftJobStatus" AS ENUM ('QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED');

-- CreateTable
CREATE TABLE "ProposalDraftJob" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "notes" TEXT NOT NULL,
    "clientEmail" TEXT,
    "clientPhone" TEXT,
    "images" JSONB,
    "status" "ProposalDraftJobStatus" NOT NULL DEFAULT 'QUEUED',
    "resultProposalId" TEXT,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "ProposalDraftJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProposalDraftJob_status_createdAt_idx" ON "ProposalDraftJob"("status", "createdAt");

-- CreateIndex
CREATE INDEX "ProposalDraftJob_organizationId_leadId_idx" ON "ProposalDraftJob"("organizationId", "leadId");

-- AddForeignKey
ALTER TABLE "ProposalDraftJob" ADD CONSTRAINT "ProposalDraftJob_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProposalDraftJob" ADD CONSTRAINT "ProposalDraftJob_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProposalDraftJob" ADD CONSTRAINT "ProposalDraftJob_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProposalDraftJob" ADD CONSTRAINT "ProposalDraftJob_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "JarvisConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
