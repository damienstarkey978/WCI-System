-- AI takeoffs + Duke purchasing intents (explicit conversion to PO).
ALTER TYPE "FinancialSourceType" ADD VALUE 'TAKEOFF';

CREATE TYPE "TakeoffStatus" AS ENUM ('DRAFT', 'READY', 'ARCHIVED');
CREATE TYPE "TakeoffLineStatus" AS ENUM ('DRAFT', 'READY', 'QUEUED', 'ORDERED', 'CANCELLED');
CREATE TYPE "PurchasingIntentStatus" AS ENUM ('QUEUED', 'CLAIMED', 'CONVERTED', 'CANCELLED');

CREATE TABLE "Takeoff" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "status" "TakeoffStatus" NOT NULL DEFAULT 'DRAFT',
    "notes" TEXT,
    "aiGenerated" BOOLEAN NOT NULL DEFAULT false,
    "aiPromptNotes" TEXT,
    "assumptions" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Takeoff_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TakeoffLine" (
    "id" TEXT NOT NULL,
    "takeoffId" TEXT NOT NULL,
    "costCodeId" TEXT NOT NULL,
    "costType" "CostType" NOT NULL DEFAULT 'NONE',
    "title" TEXT NOT NULL,
    "description" TEXT,
    "quantityMilli" INTEGER NOT NULL DEFAULT 1000,
    "unit" TEXT,
    "unitCostCents" INTEGER NOT NULL DEFAULT 0,
    "groupLabel" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "status" "TakeoffLineStatus" NOT NULL DEFAULT 'DRAFT',
    "confidence" "LineItemConfidence",
    "purchaseOrderId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TakeoffLine_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PurchasingIntent" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "takeoffId" TEXT NOT NULL,
    "takeoffLineId" TEXT NOT NULL,
    "status" "PurchasingIntentStatus" NOT NULL DEFAULT 'QUEUED',
    "vendorHint" TEXT,
    "notes" TEXT,
    "claimedByApiKeyId" TEXT,
    "claimedAt" TIMESTAMP(3),
    "purchaseOrderId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PurchasingIntent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Takeoff_organizationId_idx" ON "Takeoff"("organizationId");
CREATE INDEX "Takeoff_jobId_status_idx" ON "Takeoff"("jobId", "status");

CREATE INDEX "TakeoffLine_takeoffId_sortOrder_idx" ON "TakeoffLine"("takeoffId", "sortOrder");
CREATE INDEX "TakeoffLine_costCodeId_idx" ON "TakeoffLine"("costCodeId");
CREATE INDEX "TakeoffLine_purchaseOrderId_idx" ON "TakeoffLine"("purchaseOrderId");
CREATE INDEX "TakeoffLine_status_idx" ON "TakeoffLine"("status");

CREATE UNIQUE INDEX "PurchasingIntent_takeoffLineId_key" ON "PurchasingIntent"("takeoffLineId");
CREATE INDEX "PurchasingIntent_organizationId_status_idx" ON "PurchasingIntent"("organizationId", "status");
CREATE INDEX "PurchasingIntent_jobId_status_idx" ON "PurchasingIntent"("jobId", "status");
CREATE INDEX "PurchasingIntent_takeoffId_idx" ON "PurchasingIntent"("takeoffId");
CREATE INDEX "PurchasingIntent_purchaseOrderId_idx" ON "PurchasingIntent"("purchaseOrderId");

ALTER TABLE "Takeoff" ADD CONSTRAINT "Takeoff_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Takeoff" ADD CONSTRAINT "Takeoff_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TakeoffLine" ADD CONSTRAINT "TakeoffLine_takeoffId_fkey" FOREIGN KEY ("takeoffId") REFERENCES "Takeoff"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TakeoffLine" ADD CONSTRAINT "TakeoffLine_costCodeId_fkey" FOREIGN KEY ("costCodeId") REFERENCES "CostCode"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TakeoffLine" ADD CONSTRAINT "TakeoffLine_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "PurchaseOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "PurchasingIntent" ADD CONSTRAINT "PurchasingIntent_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PurchasingIntent" ADD CONSTRAINT "PurchasingIntent_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PurchasingIntent" ADD CONSTRAINT "PurchasingIntent_takeoffId_fkey" FOREIGN KEY ("takeoffId") REFERENCES "Takeoff"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PurchasingIntent" ADD CONSTRAINT "PurchasingIntent_takeoffLineId_fkey" FOREIGN KEY ("takeoffLineId") REFERENCES "TakeoffLine"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PurchasingIntent" ADD CONSTRAINT "PurchasingIntent_claimedByApiKeyId_fkey" FOREIGN KEY ("claimedByApiKeyId") REFERENCES "ApiKey"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PurchasingIntent" ADD CONSTRAINT "PurchasingIntent_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "PurchaseOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;
