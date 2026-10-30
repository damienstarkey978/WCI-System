-- Job-level Permit Rockstar ledger (one per job — not per JobPermit).
CREATE TYPE "PermitRockstarSetupType" AS ENUM ('FLAT_FEE', 'CARD_ON_FILE');

ALTER TABLE "Job" ADD COLUMN "permitRockstarPrivateProvider" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Job" ADD COLUMN "permitRockstarSetupType" "PermitRockstarSetupType";
ALTER TABLE "Job" ADD COLUMN "permitRockstarInvoiced" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Job" ADD COLUMN "permitRockstarPaid" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Job" ADD COLUMN "permitRockstarFeePerInspectionCents" INTEGER;
