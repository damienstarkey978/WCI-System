-- AlterTable
ALTER TABLE "File" ADD COLUMN     "folderId" TEXT;

-- CreateTable
CREATE TABLE "FileFolder" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "clientVisible" BOOLEAN NOT NULL DEFAULT true,
    "subVisible" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FileFolder_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FileFolder_organizationId_idx" ON "FileFolder"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "FileFolder_jobId_name_key" ON "FileFolder"("jobId", "name");

-- CreateIndex
CREATE INDEX "File_folderId_idx" ON "File"("folderId");

-- AddForeignKey
ALTER TABLE "File" ADD CONSTRAINT "File_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "FileFolder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FileFolder" ADD CONSTRAINT "FileFolder_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FileFolder" ADD CONSTRAINT "FileFolder_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;
