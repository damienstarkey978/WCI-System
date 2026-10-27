-- Buildertrend "Mark as a Variance PO" + "Link to Schedule" on Purchase Orders.
ALTER TABLE "PurchaseOrder" ADD COLUMN "isVariance" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "PurchaseOrder" ADD COLUMN "linkedScheduleItemId" TEXT;

ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_linkedScheduleItemId_fkey"
  FOREIGN KEY ("linkedScheduleItemId") REFERENCES "ScheduleItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "PurchaseOrder_linkedScheduleItemId_idx" ON "PurchaseOrder"("linkedScheduleItemId");
