-- P1d: require-signature + AI line sourceNote
ALTER TABLE "Proposal" ADD COLUMN IF NOT EXISTS "requireSignature" BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE "EstimateLineItem" ADD COLUMN IF NOT EXISTS "sourceNote" TEXT;
