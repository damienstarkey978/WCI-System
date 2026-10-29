-- Dual-channel mutation attribution: stamp ApiKey (API/bot) XOR User (browser)
-- alongside existing User-only creator/author columns. Extends the JobStatusEvent /
-- PurchaseOrderEvent pattern so staff can see which bot vs which human changed X.

-- Bill
ALTER TABLE "Bill" ADD COLUMN "createdByApiKeyId" TEXT;
ALTER TABLE "Bill" ADD CONSTRAINT "Bill_createdByApiKeyId_fkey" FOREIGN KEY ("createdByApiKeyId") REFERENCES "ApiKey"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "Bill_createdByApiKeyId_idx" ON "Bill"("createdByApiKeyId");

-- DailyLog: authorUserId becomes optional so API keys can author without a fake User
ALTER TABLE "DailyLog" ALTER COLUMN "authorUserId" DROP NOT NULL;
ALTER TABLE "DailyLog" ADD COLUMN "authorApiKeyId" TEXT;
ALTER TABLE "DailyLog" ADD CONSTRAINT "DailyLog_authorApiKeyId_fkey" FOREIGN KEY ("authorApiKeyId") REFERENCES "ApiKey"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "DailyLog_authorApiKeyId_idx" ON "DailyLog"("authorApiKeyId");

-- File
ALTER TABLE "File" ADD COLUMN "uploadedByApiKeyId" TEXT;
ALTER TABLE "File" ADD CONSTRAINT "File_uploadedByApiKeyId_fkey" FOREIGN KEY ("uploadedByApiKeyId") REFERENCES "ApiKey"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "File_uploadedByApiKeyId_idx" ON "File"("uploadedByApiKeyId");

-- Comment
ALTER TABLE "Comment" ADD COLUMN "authorApiKeyId" TEXT;
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_authorApiKeyId_fkey" FOREIGN KEY ("authorApiKeyId") REFERENCES "ApiKey"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "Comment_authorApiKeyId_idx" ON "Comment"("authorApiKeyId");

-- LeadActivity
ALTER TABLE "LeadActivity" ADD COLUMN "createdByApiKeyId" TEXT;
ALTER TABLE "LeadActivity" ADD CONSTRAINT "LeadActivity_createdByApiKeyId_fkey" FOREIGN KEY ("createdByApiKeyId") REFERENCES "ApiKey"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "LeadActivity_createdByApiKeyId_idx" ON "LeadActivity"("createdByApiKeyId");
