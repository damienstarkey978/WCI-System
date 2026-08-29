-- CreateTable
CREATE TABLE "EstimateTemplate" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "rateMode" "RateMode" NOT NULL DEFAULT 'MARKUP',
    "defaultRateBasisPoints" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EstimateTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EstimateTemplateLineItem" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "costCodeId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "quantityMilli" INTEGER NOT NULL DEFAULT 1000,
    "unitCostCents" INTEGER NOT NULL DEFAULT 0,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "EstimateTemplateLineItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EstimateTemplate_organizationId_idx" ON "EstimateTemplate"("organizationId");

-- CreateIndex
CREATE INDEX "EstimateTemplateLineItem_templateId_sortOrder_idx" ON "EstimateTemplateLineItem"("templateId", "sortOrder");

-- CreateIndex
CREATE INDEX "EstimateTemplateLineItem_costCodeId_idx" ON "EstimateTemplateLineItem"("costCodeId");

-- AddForeignKey
ALTER TABLE "EstimateTemplate" ADD CONSTRAINT "EstimateTemplate_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EstimateTemplateLineItem" ADD CONSTRAINT "EstimateTemplateLineItem_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "EstimateTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EstimateTemplateLineItem" ADD CONSTRAINT "EstimateTemplateLineItem_costCodeId_fkey" FOREIGN KEY ("costCodeId") REFERENCES "CostCode"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
