-- CreateEnum
CREATE TYPE "SpecificationViewMode" AS ENUM ('BOOK_VIEW', 'LIST_VIEW');

-- CreateEnum
CREATE TYPE "SubmittalType" AS ENUM ('MATERIAL_SPEC', 'SHOP_DRAWING');

-- CreateEnum
CREATE TYPE "SubmittalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'REVISE_AND_RESUBMIT');

-- CreateEnum
CREATE TYPE "WarrantyClaimStatus" AS ENUM ('SUBMITTED', 'SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'CLOSED');

-- CreateEnum
CREATE TYPE "SurveyTouchpoint" AS ENUM ('PRE_PROJECT', 'MID_PROJECT', 'POST_COMPLETION');

-- AlterEnum
ALTER TYPE "ClientActionTokenPurpose" ADD VALUE 'WARRANTY_CLIENT_ACCEPTANCE';

-- AlterEnum
ALTER TYPE "VendorActionTokenPurpose" ADD VALUE 'WARRANTY_TRADE_ACCEPTANCE';

-- CreateTable
CREATE TABLE "Specification" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "viewMode" "SpecificationViewMode" NOT NULL DEFAULT 'LIST_VIEW',
    "sourceEstimateId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Specification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SpecificationSection" (
    "id" TEXT NOT NULL,
    "specificationId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SpecificationSection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Submittal" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "type" "SubmittalType" NOT NULL,
    "status" "SubmittalStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Submittal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SubmittalRevision" (
    "id" TEXT NOT NULL,
    "submittalId" TEXT NOT NULL,
    "revisionNumber" INTEGER NOT NULL,
    "documentUrl" TEXT NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SubmittalRevision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SubmittalReviewLink" (
    "id" TEXT NOT NULL,
    "submittalId" TEXT NOT NULL,
    "reviewerName" TEXT NOT NULL,
    "reviewerEmail" TEXT NOT NULL,
    "tokenId" TEXT NOT NULL,
    "hashedSecret" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "decision" "SubmittalStatus",
    "comments" TEXT,
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SubmittalReviewLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WarrantyClaim" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "claimNumber" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "submittedByName" TEXT,
    "submittedByEmail" TEXT,
    "clientId" TEXT,
    "status" "WarrantyClaimStatus" NOT NULL DEFAULT 'SUBMITTED',
    "appointmentAt" TIMESTAMP(3),
    "assignedVendorId" TEXT,
    "tradeAcceptedAt" TIMESTAMP(3),
    "tradeAcceptanceName" TEXT,
    "clientAcceptedAt" TIMESTAMP(3),
    "clientAcceptanceName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WarrantyClaim_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Survey" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "touchpoint" "SurveyTouchpoint" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Survey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SurveyQuestion" (
    "id" TEXT NOT NULL,
    "surveyId" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "SurveyQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SurveyResponseLink" (
    "id" TEXT NOT NULL,
    "surveyId" TEXT NOT NULL,
    "recipientName" TEXT,
    "recipientEmail" TEXT,
    "tokenId" TEXT NOT NULL,
    "hashedSecret" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "answers" JSONB,
    "submittedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SurveyResponseLink_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Specification_jobId_idx" ON "Specification"("jobId");

-- CreateIndex
CREATE INDEX "SpecificationSection_specificationId_sortOrder_idx" ON "SpecificationSection"("specificationId", "sortOrder");

-- CreateIndex
CREATE INDEX "Submittal_jobId_status_idx" ON "Submittal"("jobId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "SubmittalRevision_submittalId_revisionNumber_key" ON "SubmittalRevision"("submittalId", "revisionNumber");

-- CreateIndex
CREATE UNIQUE INDEX "SubmittalReviewLink_tokenId_key" ON "SubmittalReviewLink"("tokenId");

-- CreateIndex
CREATE INDEX "SubmittalReviewLink_submittalId_idx" ON "SubmittalReviewLink"("submittalId");

-- CreateIndex
CREATE INDEX "WarrantyClaim_jobId_status_idx" ON "WarrantyClaim"("jobId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "WarrantyClaim_organizationId_claimNumber_key" ON "WarrantyClaim"("organizationId", "claimNumber");

-- CreateIndex
CREATE INDEX "SurveyQuestion_surveyId_sortOrder_idx" ON "SurveyQuestion"("surveyId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "SurveyResponseLink_tokenId_key" ON "SurveyResponseLink"("tokenId");

-- CreateIndex
CREATE INDEX "SurveyResponseLink_surveyId_idx" ON "SurveyResponseLink"("surveyId");

-- AddForeignKey
ALTER TABLE "Specification" ADD CONSTRAINT "Specification_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Specification" ADD CONSTRAINT "Specification_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Specification" ADD CONSTRAINT "Specification_sourceEstimateId_fkey" FOREIGN KEY ("sourceEstimateId") REFERENCES "Estimate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpecificationSection" ADD CONSTRAINT "SpecificationSection_specificationId_fkey" FOREIGN KEY ("specificationId") REFERENCES "Specification"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Submittal" ADD CONSTRAINT "Submittal_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Submittal" ADD CONSTRAINT "Submittal_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubmittalRevision" ADD CONSTRAINT "SubmittalRevision_submittalId_fkey" FOREIGN KEY ("submittalId") REFERENCES "Submittal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubmittalReviewLink" ADD CONSTRAINT "SubmittalReviewLink_submittalId_fkey" FOREIGN KEY ("submittalId") REFERENCES "Submittal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WarrantyClaim" ADD CONSTRAINT "WarrantyClaim_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WarrantyClaim" ADD CONSTRAINT "WarrantyClaim_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WarrantyClaim" ADD CONSTRAINT "WarrantyClaim_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WarrantyClaim" ADD CONSTRAINT "WarrantyClaim_assignedVendorId_fkey" FOREIGN KEY ("assignedVendorId") REFERENCES "Vendor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Survey" ADD CONSTRAINT "Survey_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Survey" ADD CONSTRAINT "Survey_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SurveyQuestion" ADD CONSTRAINT "SurveyQuestion_surveyId_fkey" FOREIGN KEY ("surveyId") REFERENCES "Survey"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SurveyResponseLink" ADD CONSTRAINT "SurveyResponseLink_surveyId_fkey" FOREIGN KEY ("surveyId") REFERENCES "Survey"("id") ON DELETE CASCADE ON UPDATE CASCADE;
