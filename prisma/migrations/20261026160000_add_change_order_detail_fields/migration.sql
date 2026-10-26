-- AlterTable
ALTER TABLE "ChangeOrder" ADD COLUMN "number" INTEGER;
ALTER TABLE "ChangeOrder" ADD COLUMN "deadline" TIMESTAMP(3);
ALTER TABLE "ChangeOrder" ADD COLUMN "notesBuilder" TEXT;
ALTER TABLE "ChangeOrder" ADD COLUMN "notesClient" TEXT;
ALTER TABLE "ChangeOrder" ADD COLUMN "invoiceOnApproval" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "ChangeOrder" ADD COLUMN "statusChangedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Backfill per-job sequential numbers for existing rows (oldest first).
WITH numbered AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY "jobId" ORDER BY "createdAt" ASC) AS n
  FROM "ChangeOrder"
)
UPDATE "ChangeOrder" AS co
SET "number" = numbered.n
FROM numbered
WHERE co.id = numbered.id;

ALTER TABLE "ChangeOrder" ALTER COLUMN "number" SET NOT NULL;

CREATE UNIQUE INDEX "ChangeOrder_jobId_number_key" ON "ChangeOrder"("jobId", "number");
