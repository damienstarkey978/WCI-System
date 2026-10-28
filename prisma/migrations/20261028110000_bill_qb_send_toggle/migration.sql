-- Explicit send-to-QuickBooks choice at READY_FOR_PAYMENT (materials stay WCI-only).
ALTER TABLE "Bill" ADD COLUMN "sendToQuickBooks" BOOLEAN;
ALTER TABLE "Bill" ADD COLUMN "quickBooksSkipReason" TEXT;
