-- Permit work type + cost-code defaults + RULE/COST_DB price sources (P1 #3, #31).

CREATE TYPE "PermitWorkType" AS ENUM (
  'NEW_CONSTRUCTION',
  'ALTERATIONS_AND_REPAIRS',
  'ADDITION',
  'DEMOLITION',
  'OTHER'
);

ALTER TYPE "LineItemPriceSource" ADD VALUE IF NOT EXISTS 'RULE';
ALTER TYPE "LineItemPriceSource" ADD VALUE IF NOT EXISTS 'COST_DB';

ALTER TABLE "CostCode"
  ADD COLUMN IF NOT EXISTS "defaultUnit" TEXT,
  ADD COLUMN IF NOT EXISTS "defaultUnitCostCents" INTEGER;

ALTER TABLE "Lead"
  ADD COLUMN IF NOT EXISTS "permitWorkType" "PermitWorkType";

ALTER TABLE "Estimate"
  ADD COLUMN IF NOT EXISTS "permitWorkType" "PermitWorkType";

ALTER TABLE "Job"
  ADD COLUMN IF NOT EXISTS "permitWorkType" "PermitWorkType";

-- Acceptance lead: Robin Hood Dan Cook garage remodel → Alterations & Repairs.
UPDATE "Lead"
SET "permitWorkType" = 'ALTERATIONS_AND_REPAIRS'
WHERE id = 'cmvwg65is0007gsjse3hf0tda'
  AND "permitWorkType" IS NULL;
