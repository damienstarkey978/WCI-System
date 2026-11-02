-- Batch 6: richer PAIS product fields for AcroForm fill (never invent FL#).
ALTER TABLE "PermitPackageProduct" ADD COLUMN IF NOT EXISTS "codeVersion" TEXT;
ALTER TABLE "PermitPackageProduct" ADD COLUMN IF NOT EXISTS "qaExpiration" TEXT;
ALTER TABLE "PermitPackageProduct" ADD COLUMN IF NOT EXISTS "expiresAt" TIMESTAMP(3);

ALTER TABLE "PaisProductTemplate" ADD COLUMN IF NOT EXISTS "codeVersion" TEXT;
ALTER TABLE "PaisProductTemplate" ADD COLUMN IF NOT EXISTS "qaExpiration" TEXT;
