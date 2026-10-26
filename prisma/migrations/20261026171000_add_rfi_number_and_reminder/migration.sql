-- AlterTable
ALTER TABLE "Rfi" ADD COLUMN "number" INTEGER;
ALTER TABLE "Rfi" ADD COLUMN "reminder" TEXT;

-- Backfill per-job sequential numbers (oldest first).
WITH numbered AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY "jobId" ORDER BY "createdAt" ASC) AS n
  FROM "Rfi"
)
UPDATE "Rfi" AS r
SET "number" = numbered.n
FROM numbered
WHERE r.id = numbered.id;

ALTER TABLE "Rfi" ALTER COLUMN "number" SET NOT NULL;

CREATE UNIQUE INDEX "Rfi_jobId_number_key" ON "Rfi"("jobId", "number");
