-- AlterTable
ALTER TABLE "Lead" ADD COLUMN     "confidencePercent" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "estimatedRevenueMaxCents" INTEGER,
ADD COLUMN     "estimatedRevenueMinCents" INTEGER,
ADD COLUMN     "projectType" TEXT,
ADD COLUMN     "projectedSalesDate" TIMESTAMP(3),
ADD COLUMN     "tags" TEXT[] DEFAULT ARRAY[]::TEXT[];
