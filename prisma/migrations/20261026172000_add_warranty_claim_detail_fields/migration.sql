-- AlterTable
ALTER TABLE "WarrantyClaim" ADD COLUMN "category" TEXT;
ALTER TABLE "WarrantyClaim" ADD COLUMN "priority" TEXT DEFAULT 'Low';
ALTER TABLE "WarrantyClaim" ADD COLUMN "classification" TEXT;
ALTER TABLE "WarrantyClaim" ADD COLUMN "internalNotes" TEXT;
ALTER TABLE "WarrantyClaim" ADD COLUMN "addedCostCents" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "WarrantyClaim" ADD COLUMN "showClient" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "WarrantyClaim" ADD COLUMN "followUpDate" TIMESTAMP(3);
