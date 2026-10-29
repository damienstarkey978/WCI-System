-- CreateTable
CREATE TABLE "TakeoffFile" (
    "id" TEXT NOT NULL,
    "takeoffId" TEXT NOT NULL,
    "fileId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TakeoffFile_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TakeoffFile_fileId_idx" ON "TakeoffFile"("fileId");

-- CreateIndex
CREATE UNIQUE INDEX "TakeoffFile_takeoffId_fileId_key" ON "TakeoffFile"("takeoffId", "fileId");

-- AddForeignKey
ALTER TABLE "TakeoffFile" ADD CONSTRAINT "TakeoffFile_takeoffId_fkey" FOREIGN KEY ("takeoffId") REFERENCES "Takeoff"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TakeoffFile" ADD CONSTRAINT "TakeoffFile_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "File"("id") ON DELETE CASCADE ON UPDATE CASCADE;
