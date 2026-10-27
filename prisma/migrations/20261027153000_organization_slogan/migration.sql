-- AlterTable Organization: letterhead slogan + default proposal terms
ALTER TABLE "Organization" ADD COLUMN IF NOT EXISTS "slogan" TEXT;
ALTER TABLE "Organization" ADD COLUMN IF NOT EXISTS "defaultProposalTerms" TEXT;

-- AlterTable Proposal: dual e-sign + terms snapshot
ALTER TABLE "Proposal" ADD COLUMN IF NOT EXISTS "clientSignatureHash" TEXT;
ALTER TABLE "Proposal" ADD COLUMN IF NOT EXISTS "companySignatureName" TEXT;
ALTER TABLE "Proposal" ADD COLUMN IF NOT EXISTS "companySignedAt" TIMESTAMP(3);
ALTER TABLE "Proposal" ADD COLUMN IF NOT EXISTS "companySignatureIp" TEXT;
ALTER TABLE "Proposal" ADD COLUMN IF NOT EXISTS "companySignatureHash" TEXT;
ALTER TABLE "Proposal" ADD COLUMN IF NOT EXISTS "companySignatureUserId" TEXT;
ALTER TABLE "Proposal" ADD COLUMN IF NOT EXISTS "termsText" TEXT;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "Proposal" ADD CONSTRAINT "Proposal_companySignatureUserId_fkey"
    FOREIGN KEY ("companySignatureUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
