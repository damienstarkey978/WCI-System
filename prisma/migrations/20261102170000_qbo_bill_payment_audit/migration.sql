-- Money rules 7 + 9: QBO BillPayment link + richer sync audit columns.
ALTER TABLE "Bill" ADD COLUMN IF NOT EXISTS "qboBillPaymentId" TEXT;
ALTER TABLE "QboSyncLog" ADD COLUMN IF NOT EXISTS "vendorName" TEXT;
ALTER TABLE "QboSyncLog" ADD COLUMN IF NOT EXISTS "docNumber" TEXT;
ALTER TABLE "QboSyncLog" ADD COLUMN IF NOT EXISTS "amountCents" INTEGER;
ALTER TABLE "QboSyncLog" ADD COLUMN IF NOT EXISTS "actorLabel" TEXT;
ALTER TABLE "QboSyncLog" ADD COLUMN IF NOT EXISTS "operation" TEXT;
CREATE INDEX IF NOT EXISTS "QboSyncLog_organizationId_entityType_createdAt_idx"
  ON "QboSyncLog"("organizationId", "entityType", "createdAt");
