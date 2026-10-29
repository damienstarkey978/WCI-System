-- Multiple permits per trade (second building / temp-pole / site, etc.)
DROP INDEX IF EXISTS "JobPermit_jobId_trade_key";

CREATE INDEX "JobPermit_jobId_trade_idx" ON "JobPermit"("jobId", "trade");

-- Distinct permit types beyond collapsing into OTHER
ALTER TYPE "PermitTrade" ADD VALUE 'TEMP_POLE';
ALTER TYPE "PermitTrade" ADD VALUE 'SITE';

CREATE TYPE "PermitStatus" AS ENUM ('DRAFT', 'PENDING_PAYMENT', 'ACTIVE', 'EXPIRED', 'CANCELLED');
CREATE TYPE "InspectionResult" AS ENUM ('PENDING', 'PASS', 'FAIL', 'PARTIAL');

ALTER TABLE "JobPermit" ADD COLUMN "label" TEXT;
ALTER TABLE "JobPermit" ADD COLUMN "status" "PermitStatus" NOT NULL DEFAULT 'DRAFT';
ALTER TABLE "JobPermit" ADD COLUMN "issuedAt" TIMESTAMP(3);
ALTER TABLE "JobPermit" ADD COLUMN "expiresAt" TIMESTAMP(3);
ALTER TABLE "JobPermit" ADD COLUMN "jurisdiction" TEXT;
ALTER TABLE "JobPermit" ADD COLUMN "contractorName" TEXT;

-- Backfill status from legacy pulled boolean
UPDATE "JobPermit" SET "status" = 'ACTIVE' WHERE "pulled" = true;

ALTER TABLE "JobPermitInspection" ADD COLUMN "result" "InspectionResult" NOT NULL DEFAULT 'PENDING';
ALTER TABLE "JobPermitInspection" ADD COLUMN "passedAt" TIMESTAMP(3);
ALTER TABLE "JobPermitInspection" ADD COLUMN "confirmationNumber" TEXT;
ALTER TABLE "JobPermitInspection" ADD COLUMN "inspector" TEXT;

-- Rows already marked complete → PASS + copy completedAt into passedAt when unset
UPDATE "JobPermitInspection"
SET "result" = 'PASS',
    "passedAt" = "completedAt"
WHERE "completedAt" IS NOT NULL;
