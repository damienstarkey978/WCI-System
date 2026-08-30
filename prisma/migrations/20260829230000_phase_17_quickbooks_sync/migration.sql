-- Phase 17: QuickBooks Online two-way sync (task #18, CLAUDE.md 2.3) — a
-- QuickBooksConnection per org (encrypted OAuth tokens), a QboSyncLog audit/retry
-- trail, and qboCustomerId/qboInvoiceId + qboSyncToken link fields on the first two
-- synced entities (Client, Invoice). Purely additive — no data migration needed.

-- CreateEnum
CREATE TYPE "QuickBooksEnvironment" AS ENUM ('SANDBOX', 'PRODUCTION');

-- CreateEnum
CREATE TYPE "QboSyncEntityType" AS ENUM ('CUSTOMER', 'INVOICE');

-- CreateEnum
CREATE TYPE "QboSyncDirection" AS ENUM ('TO_QBO', 'FROM_QBO');

-- CreateEnum
CREATE TYPE "QboSyncStatus" AS ENUM ('SUCCESS', 'FAILED');

-- AlterTable
ALTER TABLE "Client" ADD COLUMN     "qboCustomerId" TEXT,
ADD COLUMN     "qboSyncToken" TEXT;

-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN     "qboInvoiceId" TEXT,
ADD COLUMN     "qboSyncToken" TEXT;

-- CreateTable
CREATE TABLE "QuickBooksConnection" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "environment" "QuickBooksEnvironment" NOT NULL DEFAULT 'SANDBOX',
    "realmId" TEXT NOT NULL,
    "encryptedAccessToken" TEXT NOT NULL,
    "encryptedRefreshToken" TEXT NOT NULL,
    "accessTokenExpiresAt" TIMESTAMP(3) NOT NULL,
    "refreshTokenExpiresAt" TIMESTAMP(3) NOT NULL,
    "connectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "disconnectedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QuickBooksConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QboSyncLog" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "entityType" "QboSyncEntityType" NOT NULL,
    "direction" "QboSyncDirection" NOT NULL,
    "wciRecordId" TEXT NOT NULL,
    "qboId" TEXT,
    "status" "QboSyncStatus" NOT NULL,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QboSyncLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "QuickBooksConnection_organizationId_key" ON "QuickBooksConnection"("organizationId");

-- CreateIndex
CREATE INDEX "QboSyncLog_organizationId_entityType_wciRecordId_idx" ON "QboSyncLog"("organizationId", "entityType", "wciRecordId");

-- CreateIndex
CREATE INDEX "QboSyncLog_organizationId_status_idx" ON "QboSyncLog"("organizationId", "status");

-- AddForeignKey
ALTER TABLE "QuickBooksConnection" ADD CONSTRAINT "QuickBooksConnection_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QboSyncLog" ADD CONSTRAINT "QboSyncLog_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

