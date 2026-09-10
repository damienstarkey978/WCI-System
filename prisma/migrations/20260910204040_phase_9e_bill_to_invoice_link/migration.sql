-- AlterTable
ALTER TABLE "InvoiceLineItem" ADD COLUMN     "sourceBillId" TEXT;

-- CreateIndex
CREATE INDEX "InvoiceLineItem_sourceBillId_idx" ON "InvoiceLineItem"("sourceBillId");

-- AddForeignKey
ALTER TABLE "InvoiceLineItem" ADD CONSTRAINT "InvoiceLineItem_sourceBillId_fkey" FOREIGN KEY ("sourceBillId") REFERENCES "Bill"("id") ON DELETE SET NULL ON UPDATE CASCADE;
