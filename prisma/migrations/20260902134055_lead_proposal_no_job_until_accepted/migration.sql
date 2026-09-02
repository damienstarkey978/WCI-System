-- AlterTable
ALTER TABLE "Estimate" ADD COLUMN     "leadId" TEXT,
ALTER COLUMN "jobId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "Proposal" ALTER COLUMN "jobId" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "Estimate" ADD CONSTRAINT "Estimate_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE SET NULL ON UPDATE CASCADE;
