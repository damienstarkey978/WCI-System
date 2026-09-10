-- CreateEnum
CREATE TYPE "BillSource" AS ENUM ('MANUAL', 'UPLOAD', 'EMAIL');

-- CreateEnum
CREATE TYPE "LienWaiverStatus" AS ENUM ('UNRELEASED', 'RELEASED');

-- AlterEnum
ALTER TYPE "BillApprovalStatus" ADD VALUE 'INBOX';

-- DropIndex
DROP INDEX "Bill_organizationId_idx";

-- AlterTable
ALTER TABLE "Bill" ADD COLUMN     "createdByUserId" TEXT,
ADD COLUMN     "description" TEXT,
ADD COLUMN     "linkedScheduleItemId" TEXT,
ADD COLUMN     "source" "BillSource" NOT NULL DEFAULT 'MANUAL',
ADD COLUMN     "sourceEmailFrom" TEXT,
ADD COLUMN     "sourceEmailMessageId" TEXT,
ADD COLUMN     "sourceEmailSubject" TEXT,
ADD COLUMN     "title" TEXT;

-- CreateTable
CREATE TABLE "BillApproval" (
    "id" TEXT NOT NULL,
    "billId" TEXT NOT NULL,
    "approverUserId" TEXT NOT NULL,
    "approvedAt" TIMESTAMP(3),
    "declinedAt" TIMESTAMP(3),
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BillApproval_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LienWaiver" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "billId" TEXT NOT NULL,
    "templateName" TEXT NOT NULL,
    "body" TEXT,
    "status" "LienWaiverStatus" NOT NULL DEFAULT 'UNRELEASED',
    "releasedAt" TIMESTAMP(3),
    "fileId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LienWaiver_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BillApproval_approverUserId_approvedAt_idx" ON "BillApproval"("approverUserId", "approvedAt");

-- CreateIndex
CREATE UNIQUE INDEX "BillApproval_billId_approverUserId_key" ON "BillApproval"("billId", "approverUserId");

-- CreateIndex
CREATE INDEX "LienWaiver_organizationId_status_idx" ON "LienWaiver"("organizationId", "status");

-- CreateIndex
CREATE INDEX "LienWaiver_billId_idx" ON "LienWaiver"("billId");

-- CreateIndex
CREATE INDEX "Bill_organizationId_approvalStatus_idx" ON "Bill"("organizationId", "approvalStatus");

-- CreateIndex
CREATE INDEX "Bill_linkedScheduleItemId_idx" ON "Bill"("linkedScheduleItemId");

-- AddForeignKey
ALTER TABLE "Bill" ADD CONSTRAINT "Bill_linkedScheduleItemId_fkey" FOREIGN KEY ("linkedScheduleItemId") REFERENCES "ScheduleItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bill" ADD CONSTRAINT "Bill_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillApproval" ADD CONSTRAINT "BillApproval_billId_fkey" FOREIGN KEY ("billId") REFERENCES "Bill"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillApproval" ADD CONSTRAINT "BillApproval_approverUserId_fkey" FOREIGN KEY ("approverUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LienWaiver" ADD CONSTRAINT "LienWaiver_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LienWaiver" ADD CONSTRAINT "LienWaiver_billId_fkey" FOREIGN KEY ("billId") REFERENCES "Bill"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LienWaiver" ADD CONSTRAINT "LienWaiver_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "File"("id") ON DELETE SET NULL ON UPDATE CASCADE;
