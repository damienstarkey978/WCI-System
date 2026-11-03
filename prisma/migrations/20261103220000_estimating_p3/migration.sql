-- P3: financing toggle, confidence review, pricing display, org default template
CREATE TYPE "ProposalPricingDisplay" AS ENUM ('SINGLE', 'OPTIONS');

ALTER TABLE "EstimateLineItem"
  ADD COLUMN IF NOT EXISTS "confidenceReviewedAt" TIMESTAMP(3);

ALTER TABLE "Proposal"
  ADD COLUMN IF NOT EXISTS "showFinancing" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "pricingDisplay" "ProposalPricingDisplay" NOT NULL DEFAULT 'SINGLE';

ALTER TABLE "Organization"
  ADD COLUMN IF NOT EXISTS "defaultProposalTemplateId" TEXT;

CREATE INDEX IF NOT EXISTS "Organization_defaultProposalTemplateId_idx"
  ON "Organization"("defaultProposalTemplateId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Organization_defaultProposalTemplateId_fkey'
  ) THEN
    ALTER TABLE "Organization"
      ADD CONSTRAINT "Organization_defaultProposalTemplateId_fkey"
      FOREIGN KEY ("defaultProposalTemplateId") REFERENCES "ProposalTemplate"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
