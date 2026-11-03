-- P2c: areaLabel on lines; ProposalSection.kind
CREATE TYPE "ProposalSectionKind" AS ENUM ('SCOPE', 'EXCLUSIONS', 'WARRANTY');

ALTER TABLE "EstimateLineItem" ADD COLUMN IF NOT EXISTS "areaLabel" TEXT;

ALTER TABLE "ProposalSection"
  ADD COLUMN IF NOT EXISTS "kind" "ProposalSectionKind" NOT NULL DEFAULT 'SCOPE';
