-- CreateEnum
CREATE TYPE "PurchaseOrderWorkStatus" AS ENUM ('NOT_COMPLETE', 'WORK_COMPLETE');

-- CreateEnum
CREATE TYPE "PurchaseOrderApprovedBy" AS ENUM ('INTERNAL', 'VENDOR');

-- CreateEnum
CREATE TYPE "PurchaseOrderEventType" AS ENUM ('CREATED', 'SENT_FOR_APPROVAL', 'APPROVED', 'DECLINED', 'AMENDED', 'RECALLED', 'WORK_MARKED_COMPLETE', 'WORK_REOPENED');

-- AlterTable
ALTER TABLE "PurchaseOrder" ADD COLUMN     "agreementSnapshot" TEXT,
ADD COLUMN     "agreementSnapshotAt" TIMESTAMP(3),
ADD COLUMN     "agreementTemplateId" TEXT,
ADD COLUMN     "approvedBy" "PurchaseOrderApprovedBy",
ADD COLUMN     "completedOn" TIMESTAMP(3),
ADD COLUMN     "internalNotes" TEXT,
ADD COLUMN     "materialsOnly" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "recalledAt" TIMESTAMP(3),
ADD COLUMN     "scheduledCompletionOn" TIMESTAMP(3),
ADD COLUMN     "scopeOfWork" TEXT,
ADD COLUMN     "title" TEXT,
ADD COLUMN     "workStatus" "PurchaseOrderWorkStatus" NOT NULL DEFAULT 'NOT_COMPLETE';

-- CreateTable
CREATE TABLE "POAgreementTemplate" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "POAgreementTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseOrderEvent" (
    "id" TEXT NOT NULL,
    "purchaseOrderId" TEXT NOT NULL,
    "type" "PurchaseOrderEventType" NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "actorUserId" TEXT,
    "actorApiKeyId" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PurchaseOrderEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "POAgreementTemplate_organizationId_isActive_idx" ON "POAgreementTemplate"("organizationId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "POAgreementTemplate_organizationId_name_key" ON "POAgreementTemplate"("organizationId", "name");

-- CreateIndex
CREATE INDEX "PurchaseOrderEvent_purchaseOrderId_createdAt_idx" ON "PurchaseOrderEvent"("purchaseOrderId", "createdAt");

-- CreateIndex
CREATE INDEX "PurchaseOrder_jobId_workStatus_idx" ON "PurchaseOrder"("jobId", "workStatus");

-- AddForeignKey
ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_agreementTemplateId_fkey" FOREIGN KEY ("agreementTemplateId") REFERENCES "POAgreementTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "POAgreementTemplate" ADD CONSTRAINT "POAgreementTemplate_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrderEvent" ADD CONSTRAINT "PurchaseOrderEvent_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "PurchaseOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrderEvent" ADD CONSTRAINT "PurchaseOrderEvent_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrderEvent" ADD CONSTRAINT "PurchaseOrderEvent_actorApiKeyId_fkey" FOREIGN KEY ("actorApiKeyId") REFERENCES "ApiKey"("id") ON DELETE SET NULL ON UPDATE CASCADE;
