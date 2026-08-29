-- AlterTable
ALTER TABLE "Lead" ADD COLUMN     "contactClientId" TEXT,
ADD COLUMN     "title" TEXT;

-- CreateIndex
CREATE INDEX "Lead_contactClientId_idx" ON "Lead"("contactClientId");

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_contactClientId_fkey" FOREIGN KEY ("contactClientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;
