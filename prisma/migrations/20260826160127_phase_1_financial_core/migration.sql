-- CreateEnum
CREATE TYPE "RateMode" AS ENUM ('MARKUP', 'MARGIN');

-- CreateEnum
CREATE TYPE "EstimateStatus" AS ENUM ('DRAFT', 'SENT', 'LOCKED', 'ACCEPTED', 'DECLINED');

-- CreateEnum
CREATE TYPE "PurchaseOrderStatus" AS ENUM ('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'DECLINED', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "BillApprovalStatus" AS ENUM ('IN_REVIEW', 'APPROVED', 'READY_FOR_PAYMENT', 'PAID', 'VOID');

-- CreateEnum
CREATE TYPE "ProjectionReference" AS ENUM ('GREATEST', 'REVISED_BUDGET', 'COMMITTED', 'ACTUAL');

-- CreateEnum
CREATE TYPE "AccountingBasis" AS ENUM ('ACCRUAL', 'CASH');

-- CreateEnum
CREATE TYPE "FinancialSourceType" AS ENUM ('SCRATCH', 'ESTIMATE', 'CHANGE_ORDER', 'BID', 'SELECTION');

-- AlterTable
ALTER TABLE "Job" ADD COLUMN     "accountingBasis" "AccountingBasis" NOT NULL DEFAULT 'ACCRUAL',
ADD COLUMN     "projectionReference" "ProjectionReference" NOT NULL DEFAULT 'GREATEST';

-- CreateTable
CREATE TABLE "Estimate" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "status" "EstimateStatus" NOT NULL DEFAULT 'DRAFT',
    "version" INTEGER NOT NULL DEFAULT 1,
    "rateMode" "RateMode" NOT NULL DEFAULT 'MARKUP',
    "defaultRateBasisPoints" INTEGER NOT NULL DEFAULT 0,
    "sentAt" TIMESTAMP(3),
    "lockedAt" TIMESTAMP(3),
    "acceptedAt" TIMESTAMP(3),
    "sentToBudgetAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Estimate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EstimateLineItem" (
    "id" TEXT NOT NULL,
    "estimateId" TEXT NOT NULL,
    "costCodeId" TEXT NOT NULL,
    "costType" "CostType" NOT NULL DEFAULT 'NONE',
    "title" TEXT NOT NULL,
    "description" TEXT,
    "quantityMilli" INTEGER NOT NULL DEFAULT 1000,
    "unitCostCents" INTEGER NOT NULL DEFAULT 0,
    "rateMode" "RateMode" NOT NULL DEFAULT 'MARKUP',
    "rateBasisPoints" INTEGER NOT NULL DEFAULT 0,
    "taxable" BOOLEAN NOT NULL DEFAULT false,
    "internalNote" TEXT,
    "groupLabel" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EstimateLineItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BudgetLine" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "costCodeId" TEXT NOT NULL,
    "originalBudgetCostCents" INTEGER NOT NULL DEFAULT 0,
    "revisedBudgetCostCents" INTEGER NOT NULL DEFAULT 0,
    "originalClientPriceCents" INTEGER NOT NULL DEFAULT 0,
    "revisedClientPriceCents" INTEGER NOT NULL DEFAULT 0,
    "rateMode" "RateMode" NOT NULL DEFAULT 'MARKUP',
    "rateBasisPoints" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BudgetLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseOrder" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "poNumber" TEXT NOT NULL,
    "poSuffix" TEXT,
    "vendorName" TEXT NOT NULL,
    "status" "PurchaseOrderStatus" NOT NULL DEFAULT 'DRAFT',
    "sourceType" "FinancialSourceType" NOT NULL DEFAULT 'SCRATCH',
    "sourceId" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "approvedAt" TIMESTAMP(3),
    "declinedAt" TIMESTAMP(3),
    "vendorSignatureName" TEXT,
    "vendorSignedAt" TIMESTAMP(3),
    "vendorSignatureIp" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PurchaseOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseOrderLineItem" (
    "id" TEXT NOT NULL,
    "purchaseOrderId" TEXT NOT NULL,
    "costCodeId" TEXT NOT NULL,
    "costType" "CostType" NOT NULL DEFAULT 'NONE',
    "title" TEXT NOT NULL,
    "quantityMilli" INTEGER NOT NULL DEFAULT 1000,
    "unitCostCents" INTEGER NOT NULL DEFAULT 0,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "PurchaseOrderLineItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Bill" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "purchaseOrderId" TEXT,
    "vendorName" TEXT NOT NULL,
    "billNumber" TEXT,
    "approvalStatus" "BillApprovalStatus" NOT NULL DEFAULT 'IN_REVIEW',
    "issuedOn" TIMESTAMP(3),
    "dueOn" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "fromOcr" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Bill_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BillLineItem" (
    "id" TEXT NOT NULL,
    "billId" TEXT NOT NULL,
    "costCodeId" TEXT NOT NULL,
    "costType" "CostType" NOT NULL DEFAULT 'NONE',
    "title" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL DEFAULT 0,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "BillLineItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebhookSubscription" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "targetUrl" TEXT NOT NULL,
    "secret" TEXT NOT NULL,
    "eventTypes" TEXT[],
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WebhookSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebhookDelivery" (
    "id" TEXT NOT NULL,
    "subscriptionId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "eventId" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastAttemptAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "lastStatusCode" INTEGER,
    "lastError" TEXT,
    "nextAttemptAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WebhookDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Estimate_organizationId_idx" ON "Estimate"("organizationId");

-- CreateIndex
CREATE INDEX "Estimate_jobId_status_idx" ON "Estimate"("jobId", "status");

-- CreateIndex
CREATE INDEX "EstimateLineItem_estimateId_sortOrder_idx" ON "EstimateLineItem"("estimateId", "sortOrder");

-- CreateIndex
CREATE INDEX "EstimateLineItem_costCodeId_idx" ON "EstimateLineItem"("costCodeId");

-- CreateIndex
CREATE INDEX "BudgetLine_jobId_idx" ON "BudgetLine"("jobId");

-- CreateIndex
CREATE UNIQUE INDEX "BudgetLine_jobId_costCodeId_key" ON "BudgetLine"("jobId", "costCodeId");

-- CreateIndex
CREATE INDEX "PurchaseOrder_jobId_status_idx" ON "PurchaseOrder"("jobId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "PurchaseOrder_organizationId_poNumber_key" ON "PurchaseOrder"("organizationId", "poNumber");

-- CreateIndex
CREATE INDEX "PurchaseOrderLineItem_purchaseOrderId_sortOrder_idx" ON "PurchaseOrderLineItem"("purchaseOrderId", "sortOrder");

-- CreateIndex
CREATE INDEX "PurchaseOrderLineItem_costCodeId_idx" ON "PurchaseOrderLineItem"("costCodeId");

-- CreateIndex
CREATE INDEX "Bill_jobId_approvalStatus_idx" ON "Bill"("jobId", "approvalStatus");

-- CreateIndex
CREATE INDEX "Bill_organizationId_idx" ON "Bill"("organizationId");

-- CreateIndex
CREATE INDEX "Bill_purchaseOrderId_idx" ON "Bill"("purchaseOrderId");

-- CreateIndex
CREATE INDEX "BillLineItem_billId_sortOrder_idx" ON "BillLineItem"("billId", "sortOrder");

-- CreateIndex
CREATE INDEX "BillLineItem_costCodeId_idx" ON "BillLineItem"("costCodeId");

-- CreateIndex
CREATE INDEX "WebhookSubscription_organizationId_isActive_idx" ON "WebhookSubscription"("organizationId", "isActive");

-- CreateIndex
CREATE INDEX "WebhookDelivery_subscriptionId_deliveredAt_idx" ON "WebhookDelivery"("subscriptionId", "deliveredAt");

-- CreateIndex
CREATE INDEX "WebhookDelivery_nextAttemptAt_idx" ON "WebhookDelivery"("nextAttemptAt");

-- AddForeignKey
ALTER TABLE "Estimate" ADD CONSTRAINT "Estimate_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Estimate" ADD CONSTRAINT "Estimate_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EstimateLineItem" ADD CONSTRAINT "EstimateLineItem_estimateId_fkey" FOREIGN KEY ("estimateId") REFERENCES "Estimate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EstimateLineItem" ADD CONSTRAINT "EstimateLineItem_costCodeId_fkey" FOREIGN KEY ("costCodeId") REFERENCES "CostCode"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BudgetLine" ADD CONSTRAINT "BudgetLine_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BudgetLine" ADD CONSTRAINT "BudgetLine_costCodeId_fkey" FOREIGN KEY ("costCodeId") REFERENCES "CostCode"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrderLineItem" ADD CONSTRAINT "PurchaseOrderLineItem_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "PurchaseOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrderLineItem" ADD CONSTRAINT "PurchaseOrderLineItem_costCodeId_fkey" FOREIGN KEY ("costCodeId") REFERENCES "CostCode"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bill" ADD CONSTRAINT "Bill_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bill" ADD CONSTRAINT "Bill_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bill" ADD CONSTRAINT "Bill_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "PurchaseOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillLineItem" ADD CONSTRAINT "BillLineItem_billId_fkey" FOREIGN KEY ("billId") REFERENCES "Bill"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillLineItem" ADD CONSTRAINT "BillLineItem_costCodeId_fkey" FOREIGN KEY ("costCodeId") REFERENCES "CostCode"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebhookSubscription" ADD CONSTRAINT "WebhookSubscription_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebhookDelivery" ADD CONSTRAINT "WebhookDelivery_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "WebhookSubscription"("id") ON DELETE CASCADE ON UPDATE CASCADE;
