-- AlterEnum SubmittalType (new values only; commit before use if PG requires it)
ALTER TYPE "SubmittalType" ADD VALUE 'PRODUCT_DATA';
ALTER TYPE "SubmittalType" ADD VALUE 'SAMPLE';
ALTER TYPE "SubmittalType" ADD VALUE 'OTHER';

-- AlterEnum SubmittalStatus
ALTER TYPE "SubmittalStatus" ADD VALUE 'DRAFT';
ALTER TYPE "SubmittalStatus" ADD VALUE 'IN_APPROVAL';
ALTER TYPE "SubmittalStatus" ADD VALUE 'APPROVED_AS_NOTED';
ALTER TYPE "SubmittalStatus" ADD VALUE 'VOIDED';
ALTER TYPE "SubmittalStatus" ADD VALUE 'AWAITING_DOCUMENTS';

-- AlterTable (status default stays PENDING at DB level; app sets DRAFT on create)
ALTER TABLE "Submittal" ADD COLUMN "number" INTEGER;
ALTER TABLE "Submittal" ADD COLUMN "description" TEXT;
ALTER TABLE "Submittal" ADD COLUMN "packageName" TEXT;
ALTER TABLE "Submittal" ADD COLUMN "division" TEXT;
ALTER TABLE "Submittal" ADD COLUMN "specSection" TEXT;
ALTER TABLE "Submittal" ADD COLUMN "finalDueDate" TIMESTAMP(3);
ALTER TABLE "Submittal" ADD COLUMN "managerUserId" TEXT;
ALTER TABLE "Submittal" ADD COLUMN "vendorId" TEXT;

-- Backfill per-job sequential numbers for existing rows
WITH numbered AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY "jobId" ORDER BY "createdAt" ASC) AS rn
  FROM "Submittal"
)
UPDATE "Submittal" s
SET "number" = numbered.rn
FROM numbered
WHERE s.id = numbered.id;

ALTER TABLE "Submittal" ALTER COLUMN "number" SET NOT NULL;

CREATE UNIQUE INDEX "Submittal_jobId_number_key" ON "Submittal"("jobId", "number");

ALTER TABLE "Submittal" ADD CONSTRAINT "Submittal_managerUserId_fkey" FOREIGN KEY ("managerUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Submittal" ADD CONSTRAINT "Submittal_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE SET NULL ON UPDATE CASCADE;
