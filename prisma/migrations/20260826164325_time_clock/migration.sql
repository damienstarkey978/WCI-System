-- CreateEnum
CREATE TYPE "TimeClockApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "GeofenceStatus" AS ENUM ('INSIDE', 'OUTSIDE', 'NOT_APPLICABLE');

-- CreateEnum
CREATE TYPE "LaborRateSource" AS ENUM ('COST_CODE_DEFAULT', 'MANUAL_OVERRIDE');

-- AlterTable
ALTER TABLE "CostCode" ADD COLUMN     "defaultHourlyRateCents" INTEGER;

-- AlterTable
ALTER TABLE "Job" ADD COLUMN     "geofenceRadiusMeters" INTEGER;

-- CreateTable
CREATE TABLE "TimeClockEntry" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "costCodeId" TEXT NOT NULL,
    "clockInAt" TIMESTAMP(3) NOT NULL,
    "clockOutAt" TIMESTAMP(3),
    "gpsInLatitude" DOUBLE PRECISION,
    "gpsInLongitude" DOUBLE PRECISION,
    "gpsOutLatitude" DOUBLE PRECISION,
    "gpsOutLongitude" DOUBLE PRECISION,
    "geofenceStatus" "GeofenceStatus" NOT NULL DEFAULT 'NOT_APPLICABLE',
    "approvalStatus" "TimeClockApprovalStatus" NOT NULL DEFAULT 'PENDING',
    "approvedByUserId" TEXT,
    "approvedAt" TIMESTAMP(3),
    "hourlyRateCents" INTEGER NOT NULL,
    "rateSource" "LaborRateSource" NOT NULL DEFAULT 'COST_CODE_DEFAULT',
    "clockedInByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TimeClockEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TimeClockBreak" (
    "id" TEXT NOT NULL,
    "timeClockEntryId" TEXT NOT NULL,
    "startAt" TIMESTAMP(3) NOT NULL,
    "endAt" TIMESTAMP(3),

    CONSTRAINT "TimeClockBreak_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TimeClockEntry_organizationId_userId_idx" ON "TimeClockEntry"("organizationId", "userId");

-- CreateIndex
CREATE INDEX "TimeClockEntry_jobId_approvalStatus_idx" ON "TimeClockEntry"("jobId", "approvalStatus");

-- CreateIndex
CREATE INDEX "TimeClockBreak_timeClockEntryId_idx" ON "TimeClockBreak"("timeClockEntryId");

-- AddForeignKey
ALTER TABLE "TimeClockEntry" ADD CONSTRAINT "TimeClockEntry_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimeClockEntry" ADD CONSTRAINT "TimeClockEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimeClockEntry" ADD CONSTRAINT "TimeClockEntry_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimeClockEntry" ADD CONSTRAINT "TimeClockEntry_costCodeId_fkey" FOREIGN KEY ("costCodeId") REFERENCES "CostCode"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimeClockEntry" ADD CONSTRAINT "TimeClockEntry_approvedByUserId_fkey" FOREIGN KEY ("approvedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimeClockEntry" ADD CONSTRAINT "TimeClockEntry_clockedInByUserId_fkey" FOREIGN KEY ("clockedInByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimeClockBreak" ADD CONSTRAINT "TimeClockBreak_timeClockEntryId_fkey" FOREIGN KEY ("timeClockEntryId") REFERENCES "TimeClockEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;
