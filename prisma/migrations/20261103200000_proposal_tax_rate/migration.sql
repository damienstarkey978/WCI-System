-- P2a: org/proposal tax rate (default 0%)
ALTER TABLE "Organization" ADD COLUMN IF NOT EXISTS "defaultTaxRateBasisPoints" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Proposal" ADD COLUMN IF NOT EXISTS "taxRateBasisPoints" INTEGER NOT NULL DEFAULT 0;
