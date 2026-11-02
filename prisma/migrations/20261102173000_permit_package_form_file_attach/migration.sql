-- Link filled permit-package PDFs into Files → Attached Documents.

ALTER TABLE "File" ADD COLUMN "permitPackageFormId" TEXT;

CREATE UNIQUE INDEX "File_permitPackageFormId_key" ON "File"("permitPackageFormId");

CREATE INDEX "File_permitPackageFormId_idx" ON "File"("permitPackageFormId");

ALTER TABLE "File" ADD CONSTRAINT "File_permitPackageFormId_fkey" FOREIGN KEY ("permitPackageFormId") REFERENCES "PermitPackageForm"("id") ON DELETE SET NULL ON UPDATE CASCADE;
