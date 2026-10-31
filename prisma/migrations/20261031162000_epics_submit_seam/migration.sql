-- CreateEnum
CREATE TYPE "EpicsSubmitStatus" AS ENUM ('QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'NEEDS_REVIEW');

-- CreateTable
CREATE TABLE "EpicsSubmitRequest" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "packageId" TEXT NOT NULL,
    "status" "EpicsSubmitStatus" NOT NULL DEFAULT 'QUEUED',
    "requestedByUserId" TEXT,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "claimedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "steps" JSONB NOT NULL DEFAULT '[]',
    "lastError" TEXT,
    "failureScreenshotUrl" TEXT,
    "resultPermitNumber" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EpicsSubmitRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EpicsSubmitRequest_organizationId_status_idx" ON "EpicsSubmitRequest"("organizationId", "status");

-- CreateIndex
CREATE INDEX "EpicsSubmitRequest_packageId_status_idx" ON "EpicsSubmitRequest"("packageId", "status");

-- AddForeignKey
ALTER TABLE "EpicsSubmitRequest" ADD CONSTRAINT "EpicsSubmitRequest_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EpicsSubmitRequest" ADD CONSTRAINT "EpicsSubmitRequest_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "PermitPackage"("id") ON DELETE CASCADE ON UPDATE CASCADE;
