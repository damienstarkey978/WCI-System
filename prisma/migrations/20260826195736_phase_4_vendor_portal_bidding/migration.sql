-- CreateEnum
CREATE TYPE "VendorActionTokenPurpose" AS ENUM ('PORTAL_LOGIN', 'PO_ACCEPTANCE');

-- CreateEnum
CREATE TYPE "BidPackageStatus" AS ENUM ('OPEN', 'CLOSED', 'AWARDED');

-- CreateEnum
CREATE TYPE "BidSubmissionStatus" AS ENUM ('INVITED', 'DRAFT', 'SUBMITTED', 'ACCEPTED', 'DECLINED');

-- AlterTable
ALTER TABLE "Bill" ADD COLUMN     "vendorId" TEXT;

-- AlterTable
ALTER TABLE "PurchaseOrder" ADD COLUMN     "vendorId" TEXT;

-- CreateTable
CREATE TABLE "Vendor" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "tradeType" TEXT,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "addressLine1" TEXT,
    "city" TEXT,
    "state" TEXT,
    "postalCode" TEXT,
    "invitedAt" TIMESTAMP(3),
    "activatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Vendor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VendorCertification" (
    "id" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VendorCertification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VendorJobAccess" (
    "id" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "scheduleScope" "ScheduleScope" NOT NULL DEFAULT 'ASSIGNED_ONLY',
    "canViewDocuments" BOOLEAN NOT NULL DEFAULT true,
    "canViewPurchaseOrders" BOOLEAN NOT NULL DEFAULT true,
    "canViewBills" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VendorJobAccess_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VendorSession" (
    "id" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "tokenId" TEXT NOT NULL,
    "hashedSecret" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "lastUsedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VendorSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VendorActionToken" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "purpose" "VendorActionTokenPurpose" NOT NULL,
    "resourceId" TEXT,
    "tokenId" TEXT NOT NULL,
    "hashedSecret" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VendorActionToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BidPackage" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "dueDate" TIMESTAMP(3),
    "status" "BidPackageStatus" NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BidPackage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BidPackageLineItem" (
    "id" TEXT NOT NULL,
    "bidPackageId" TEXT NOT NULL,
    "costCodeId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "quantityMilli" INTEGER,
    "unit" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "BidPackageLineItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BidSubmission" (
    "id" TEXT NOT NULL,
    "bidPackageId" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "status" "BidSubmissionStatus" NOT NULL DEFAULT 'INVITED',
    "totalCents" INTEGER,
    "notes" TEXT,
    "editedByStaff" BOOLEAN NOT NULL DEFAULT false,
    "invitedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "submittedAt" TIMESTAMP(3),
    "decidedAt" TIMESTAMP(3),
    "lockedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BidSubmission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BidSubmissionLineItem" (
    "id" TEXT NOT NULL,
    "bidSubmissionId" TEXT NOT NULL,
    "bidPackageLineItemId" TEXT,
    "title" TEXT NOT NULL,
    "quantityMilli" INTEGER NOT NULL DEFAULT 1000,
    "unitCostCents" INTEGER NOT NULL DEFAULT 0,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "BidSubmissionLineItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Vendor_organizationId_idx" ON "Vendor"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "Vendor_organizationId_email_key" ON "Vendor"("organizationId", "email");

-- CreateIndex
CREATE INDEX "VendorCertification_vendorId_idx" ON "VendorCertification"("vendorId");

-- CreateIndex
CREATE INDEX "VendorCertification_expiresAt_idx" ON "VendorCertification"("expiresAt");

-- CreateIndex
CREATE INDEX "VendorJobAccess_jobId_idx" ON "VendorJobAccess"("jobId");

-- CreateIndex
CREATE UNIQUE INDEX "VendorJobAccess_vendorId_jobId_key" ON "VendorJobAccess"("vendorId", "jobId");

-- CreateIndex
CREATE UNIQUE INDEX "VendorSession_tokenId_key" ON "VendorSession"("tokenId");

-- CreateIndex
CREATE INDEX "VendorSession_vendorId_idx" ON "VendorSession"("vendorId");

-- CreateIndex
CREATE UNIQUE INDEX "VendorActionToken_tokenId_key" ON "VendorActionToken"("tokenId");

-- CreateIndex
CREATE INDEX "VendorActionToken_vendorId_purpose_idx" ON "VendorActionToken"("vendorId", "purpose");

-- CreateIndex
CREATE INDEX "BidPackage_jobId_status_idx" ON "BidPackage"("jobId", "status");

-- CreateIndex
CREATE INDEX "BidPackageLineItem_bidPackageId_sortOrder_idx" ON "BidPackageLineItem"("bidPackageId", "sortOrder");

-- CreateIndex
CREATE INDEX "BidSubmission_vendorId_idx" ON "BidSubmission"("vendorId");

-- CreateIndex
CREATE UNIQUE INDEX "BidSubmission_bidPackageId_vendorId_key" ON "BidSubmission"("bidPackageId", "vendorId");

-- CreateIndex
CREATE INDEX "BidSubmissionLineItem_bidSubmissionId_sortOrder_idx" ON "BidSubmissionLineItem"("bidSubmissionId", "sortOrder");

-- CreateIndex
CREATE INDEX "Bill_vendorId_idx" ON "Bill"("vendorId");

-- CreateIndex
CREATE INDEX "PurchaseOrder_vendorId_idx" ON "PurchaseOrder"("vendorId");

-- AddForeignKey
ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bill" ADD CONSTRAINT "Bill_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vendor" ADD CONSTRAINT "Vendor_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorCertification" ADD CONSTRAINT "VendorCertification_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorJobAccess" ADD CONSTRAINT "VendorJobAccess_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorJobAccess" ADD CONSTRAINT "VendorJobAccess_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorSession" ADD CONSTRAINT "VendorSession_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorActionToken" ADD CONSTRAINT "VendorActionToken_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorActionToken" ADD CONSTRAINT "VendorActionToken_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BidPackage" ADD CONSTRAINT "BidPackage_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BidPackage" ADD CONSTRAINT "BidPackage_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BidPackageLineItem" ADD CONSTRAINT "BidPackageLineItem_bidPackageId_fkey" FOREIGN KEY ("bidPackageId") REFERENCES "BidPackage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BidPackageLineItem" ADD CONSTRAINT "BidPackageLineItem_costCodeId_fkey" FOREIGN KEY ("costCodeId") REFERENCES "CostCode"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BidSubmission" ADD CONSTRAINT "BidSubmission_bidPackageId_fkey" FOREIGN KEY ("bidPackageId") REFERENCES "BidPackage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BidSubmission" ADD CONSTRAINT "BidSubmission_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BidSubmissionLineItem" ADD CONSTRAINT "BidSubmissionLineItem_bidSubmissionId_fkey" FOREIGN KEY ("bidSubmissionId") REFERENCES "BidSubmission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BidSubmissionLineItem" ADD CONSTRAINT "BidSubmissionLineItem_bidPackageLineItemId_fkey" FOREIGN KEY ("bidPackageLineItemId") REFERENCES "BidPackageLineItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
