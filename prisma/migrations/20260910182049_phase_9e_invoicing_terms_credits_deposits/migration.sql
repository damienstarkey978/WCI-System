-- CreateEnum
CREATE TYPE "PaymentTerms" AS ENUM ('DUE_ON_RECEIPT', 'NET_15', 'NET_30', 'NET_45', 'NET_60', 'CUSTOM');

-- CreateEnum
CREATE TYPE "CreditMemoStatus" AS ENUM ('DRAFT', 'ISSUED', 'APPLIED', 'VOID');

-- CreateEnum
CREATE TYPE "DepositStatus" AS ENUM ('REQUESTED', 'RECEIVED', 'APPLIED', 'REFUNDED');

-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN     "clientLastViewedAt" TIMESTAMP(3),
ADD COLUMN     "clientMessage" TEXT,
ADD COLUMN     "lastSentAt" TIMESTAMP(3),
ADD COLUMN     "paymentTerms" "PaymentTerms" NOT NULL DEFAULT 'NET_30',
ADD COLUMN     "sendCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "taxCents" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "taxRateBasisPoints" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "InvoiceLineItem" ADD COLUMN     "costCodeId" TEXT,
ADD COLUMN     "quantityMilli" INTEGER,
ADD COLUMN     "rateBasisPoints" INTEGER,
ADD COLUMN     "rateMode" "RateMode",
ADD COLUMN     "taxable" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "unitCostCents" INTEGER;

-- CreateTable
CREATE TABLE "CreditMemo" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "invoiceId" TEXT,
    "memoNumber" TEXT NOT NULL,
    "status" "CreditMemoStatus" NOT NULL DEFAULT 'DRAFT',
    "amountCents" INTEGER NOT NULL,
    "reason" TEXT,
    "issuedOn" TIMESTAMP(3),
    "appliedAt" TIMESTAMP(3),
    "voidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CreditMemo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Deposit" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "invoiceId" TEXT,
    "title" TEXT NOT NULL,
    "status" "DepositStatus" NOT NULL DEFAULT 'REQUESTED',
    "amountCents" INTEGER NOT NULL,
    "method" "PaymentMethod",
    "reference" TEXT,
    "requestedOn" TIMESTAMP(3),
    "receivedAt" TIMESTAMP(3),
    "appliedAt" TIMESTAMP(3),
    "refundedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Deposit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CreditMemo_jobId_status_idx" ON "CreditMemo"("jobId", "status");

-- CreateIndex
CREATE INDEX "CreditMemo_invoiceId_idx" ON "CreditMemo"("invoiceId");

-- CreateIndex
CREATE UNIQUE INDEX "CreditMemo_organizationId_memoNumber_key" ON "CreditMemo"("organizationId", "memoNumber");

-- CreateIndex
CREATE INDEX "Deposit_jobId_status_idx" ON "Deposit"("jobId", "status");

-- CreateIndex
CREATE INDEX "Deposit_invoiceId_idx" ON "Deposit"("invoiceId");

-- CreateIndex
CREATE INDEX "InvoiceLineItem_costCodeId_idx" ON "InvoiceLineItem"("costCodeId");

-- AddForeignKey
ALTER TABLE "InvoiceLineItem" ADD CONSTRAINT "InvoiceLineItem_costCodeId_fkey" FOREIGN KEY ("costCodeId") REFERENCES "CostCode"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditMemo" ADD CONSTRAINT "CreditMemo_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditMemo" ADD CONSTRAINT "CreditMemo_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditMemo" ADD CONSTRAINT "CreditMemo_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Deposit" ADD CONSTRAINT "Deposit_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Deposit" ADD CONSTRAINT "Deposit_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Deposit" ADD CONSTRAINT "Deposit_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;
