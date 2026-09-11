-- CreateEnum
CREATE TYPE "InboundEmailStatus" AS ENUM ('ROUTED', 'UNROUTED', 'FAILED');

-- AlterTable
ALTER TABLE "Bill" ADD COLUMN     "inboundEmailId" TEXT;

-- CreateTable
CREATE TABLE "InboundEmail" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT,
    "jobId" TEXT,
    "status" "InboundEmailStatus" NOT NULL DEFAULT 'UNROUTED',
    "toAddress" TEXT NOT NULL,
    "fromAddress" TEXT NOT NULL,
    "subject" TEXT,
    "messageId" TEXT NOT NULL,
    "textBody" TEXT,
    "attachmentCount" INTEGER NOT NULL DEFAULT 0,
    "storedPaths" TEXT[],
    "note" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),

    CONSTRAINT "InboundEmail_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "InboundEmail_messageId_key" ON "InboundEmail"("messageId");

-- CreateIndex
CREATE INDEX "InboundEmail_status_receivedAt_idx" ON "InboundEmail"("status", "receivedAt");

-- CreateIndex
CREATE INDEX "InboundEmail_organizationId_receivedAt_idx" ON "InboundEmail"("organizationId", "receivedAt");

-- AddForeignKey
ALTER TABLE "Bill" ADD CONSTRAINT "Bill_inboundEmailId_fkey" FOREIGN KEY ("inboundEmailId") REFERENCES "InboundEmail"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InboundEmail" ADD CONSTRAINT "InboundEmail_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InboundEmail" ADD CONSTRAINT "InboundEmail_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE SET NULL ON UPDATE CASCADE;
