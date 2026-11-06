-- AlterTable
ALTER TABLE "InvoiceLineItem" ADD COLUMN "sourceChangeOrderLineId" TEXT;
ALTER TABLE "InvoiceLineItem" ADD COLUMN "sourceChangeOrderId" TEXT;

-- CreateIndex
CREATE INDEX "InvoiceLineItem_sourceChangeOrderLineId_idx" ON "InvoiceLineItem"("sourceChangeOrderLineId");
CREATE INDEX "InvoiceLineItem_sourceChangeOrderId_idx" ON "InvoiceLineItem"("sourceChangeOrderId");

-- AddForeignKey
ALTER TABLE "InvoiceLineItem" ADD CONSTRAINT "InvoiceLineItem_sourceChangeOrderLineId_fkey" FOREIGN KEY ("sourceChangeOrderLineId") REFERENCES "ChangeOrderLineItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "InvoiceLineItem" ADD CONSTRAINT "InvoiceLineItem_sourceChangeOrderId_fkey" FOREIGN KEY ("sourceChangeOrderId") REFERENCES "ChangeOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;
