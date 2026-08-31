-- AlterTable
ALTER TABLE "File" ADD COLUMN     "billId" TEXT,
ADD COLUMN     "invoiceId" TEXT,
ADD COLUMN     "purchaseOrderId" TEXT;

-- CreateIndex
CREATE INDEX "File_billId_idx" ON "File"("billId");

-- CreateIndex
CREATE INDEX "File_purchaseOrderId_idx" ON "File"("purchaseOrderId");

-- CreateIndex
CREATE INDEX "File_invoiceId_idx" ON "File"("invoiceId");

-- AddForeignKey
ALTER TABLE "File" ADD CONSTRAINT "File_billId_fkey" FOREIGN KEY ("billId") REFERENCES "Bill"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "File" ADD CONSTRAINT "File_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "PurchaseOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "File" ADD CONSTRAINT "File_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

