-- AlterTable
ALTER TABLE "Job" ADD COLUMN "nocOnFile" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "ntboFiled" BOOLEAN NOT NULL DEFAULT false;

-- CreateEnum
CREATE TYPE "PermitTrade" AS ENUM ('BUILDING', 'ELECTRICAL', 'PLUMBING', 'MECHANICAL', 'OTHER');

-- CreateTable
CREATE TABLE "JobPermit" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "trade" "PermitTrade" NOT NULL,
    "permitNumber" TEXT,
    "pulled" BOOLEAN NOT NULL DEFAULT false,
    "pulledAt" TIMESTAMP(3),
    "vendorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JobPermit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobPermitInspection" (
    "id" TEXT NOT NULL,
    "permitId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "completedAt" TIMESTAMP(3),
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JobPermitInspection_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "JobPermit_organizationId_idx" ON "JobPermit"("organizationId");

-- CreateIndex
CREATE INDEX "JobPermit_jobId_idx" ON "JobPermit"("jobId");

-- CreateIndex
CREATE UNIQUE INDEX "JobPermit_jobId_trade_key" ON "JobPermit"("jobId", "trade");

-- CreateIndex
CREATE INDEX "JobPermitInspection_permitId_idx" ON "JobPermitInspection"("permitId");

-- AddForeignKey
ALTER TABLE "JobPermit" ADD CONSTRAINT "JobPermit_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobPermit" ADD CONSTRAINT "JobPermit_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobPermit" ADD CONSTRAINT "JobPermit_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobPermitInspection" ADD CONSTRAINT "JobPermitInspection_permitId_fkey" FOREIGN KEY ("permitId") REFERENCES "JobPermit"("id") ON DELETE CASCADE ON UPDATE CASCADE;
