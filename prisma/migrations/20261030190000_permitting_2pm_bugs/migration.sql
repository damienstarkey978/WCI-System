-- Heather 2pm permitting bugs: statuses, NOC/NTBO details, Rockstar invoice fields.

-- Permit lifecycle: finalized + returned for corrections (not "active").
ALTER TYPE "PermitStatus" ADD VALUE 'FINALIZED';
ALTER TYPE "PermitStatus" ADD VALUE 'RETURNED_FOR_CORRECTIONS';

-- NOC / NTBO: number + filed date (booleans remain for chips / docs).
ALTER TABLE "Job" ADD COLUMN "nocNumber" TEXT;
ALTER TABLE "Job" ADD COLUMN "nocFiledOn" TIMESTAMP(3);
ALTER TABLE "Job" ADD COLUMN "ntboNumber" TEXT;
ALTER TABLE "Job" ADD COLUMN "ntboFiledOn" TIMESTAMP(3);

-- Permit Rockstar ledger: invoice identity + amounts/dates (extends #77).
ALTER TABLE "Job" ADD COLUMN "permitRockstarInvoiceNumber" TEXT;
ALTER TABLE "Job" ADD COLUMN "permitRockstarInvoiceAmountCents" INTEGER;
ALTER TABLE "Job" ADD COLUMN "permitRockstarInvoicedAt" TIMESTAMP(3);
ALTER TABLE "Job" ADD COLUMN "permitRockstarPaidAt" TIMESTAMP(3);
