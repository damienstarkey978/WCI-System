-- AlterTable
ALTER TABLE "ClientUpdateSummary" ADD COLUMN "approvedAt" TIMESTAMP(3),
ADD COLUMN "emailedAt" TIMESTAMP(3),
ADD COLUMN "emailedTo" TEXT;
