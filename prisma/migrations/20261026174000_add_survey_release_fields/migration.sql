-- AlterTable
ALTER TABLE "Survey" ADD COLUMN "invitationBody" TEXT;
ALTER TABLE "Survey" ADD COLUMN "releaseAt" TIMESTAMP(3);
ALTER TABLE "Survey" ADD COLUMN "clientId" TEXT;

CREATE INDEX "Survey_jobId_idx" ON "Survey"("jobId");

ALTER TABLE "Survey" ADD CONSTRAINT "Survey_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;
