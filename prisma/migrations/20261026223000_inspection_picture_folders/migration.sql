-- AlterTable
ALTER TABLE "JobPermitInspection" ADD COLUMN "folderId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "JobPermitInspection_folderId_key" ON "JobPermitInspection"("folderId");

-- AddForeignKey
ALTER TABLE "JobPermitInspection" ADD CONSTRAINT "JobPermitInspection_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "FileFolder"("id") ON DELETE SET NULL ON UPDATE CASCADE;
