-- Org locked 40% markup defaults (Handoff estimating parity P1 #1).
ALTER TABLE "Organization"
  ADD COLUMN IF NOT EXISTS "defaultEstimateRateMode" "RateMode" NOT NULL DEFAULT 'MARKUP',
  ADD COLUMN IF NOT EXISTS "defaultEstimateRateBasisPoints" INTEGER NOT NULL DEFAULT 4000,
  ADD COLUMN IF NOT EXISTS "allowPerLineRateOverride" BOOLEAN NOT NULL DEFAULT false;

-- New estimates default to 40% when the caller omits defaultRateBasisPoints.
ALTER TABLE "Estimate"
  ALTER COLUMN "defaultRateBasisPoints" SET DEFAULT 4000;

-- CR item 22 early: fix known TLD typo .comm → .com (Robin Hood Dan Cook lead).
UPDATE "Lead"
SET email = regexp_replace(email, '\.comm$', '.com', 'i')
WHERE email ILIKE '%.comm';

UPDATE "Client"
SET email = regexp_replace(email, '\.comm$', '.com', 'i')
WHERE email ILIKE '%.comm';
