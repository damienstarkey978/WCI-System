-- CreateEnum
CREATE TYPE "SelectionType" AS ENUM ('SINGLE', 'SHARED');

-- AlterTable
ALTER TABLE "Selection" ADD COLUMN "category" TEXT;
ALTER TABLE "Selection" ADD COLUMN "location" TEXT;
ALTER TABLE "Selection" ADD COLUMN "requireClientSelection" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Selection" ADD COLUMN "selectionType" "SelectionType" NOT NULL DEFAULT 'SINGLE';

-- CreateIndex
CREATE INDEX "Selection_jobId_category_idx" ON "Selection"("jobId", "category");
