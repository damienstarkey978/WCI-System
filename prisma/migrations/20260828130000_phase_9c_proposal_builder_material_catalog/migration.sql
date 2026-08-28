
-- CreateEnum
CREATE TYPE "MaterialVendor" AS ENUM ('LOWES', 'HOME_DEPOT', 'OTHER');

-- CreateEnum
CREATE TYPE "MaterialPriceSource" AS ENUM ('MANUAL', 'WEB_SEARCH');

-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "addressLine1" TEXT,
ADD COLUMN     "city" TEXT,
ADD COLUMN     "contactEmail" TEXT,
ADD COLUMN     "contactPhone" TEXT,
ADD COLUMN     "logoPath" TEXT,
ADD COLUMN     "postalCode" TEXT,
ADD COLUMN     "state" TEXT;

-- CreateTable
CREATE TABLE "ProposalSection" (
    "id" TEXT NOT NULL,
    "proposalId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ProposalSection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProposalSectionBullet" (
    "id" TEXT NOT NULL,
    "sectionId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ProposalSectionBullet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MaterialCatalogItem" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "vendor" "MaterialVendor" NOT NULL,
    "sku" TEXT,
    "description" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "unitCostCents" INTEGER NOT NULL,
    "category" TEXT,
    "source" "MaterialPriceSource" NOT NULL DEFAULT 'MANUAL',
    "sourceUrl" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MaterialCatalogItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProposalSection_proposalId_sortOrder_idx" ON "ProposalSection"("proposalId", "sortOrder");

-- CreateIndex
CREATE INDEX "ProposalSectionBullet_sectionId_sortOrder_idx" ON "ProposalSectionBullet"("sectionId", "sortOrder");

-- CreateIndex
CREATE INDEX "MaterialCatalogItem_organizationId_vendor_idx" ON "MaterialCatalogItem"("organizationId", "vendor");

-- CreateIndex
CREATE INDEX "MaterialCatalogItem_organizationId_category_idx" ON "MaterialCatalogItem"("organizationId", "category");

-- AddForeignKey
ALTER TABLE "ProposalSection" ADD CONSTRAINT "ProposalSection_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "Proposal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProposalSectionBullet" ADD CONSTRAINT "ProposalSectionBullet_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "ProposalSection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialCatalogItem" ADD CONSTRAINT "MaterialCatalogItem_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

