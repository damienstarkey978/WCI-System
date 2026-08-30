-- Phase 18: Vendor QuickBooks sync (task #18, CLAUDE.md 2.3) — extends the sync log's
-- entity type to VENDOR and adds qboVendorId/qboSyncToken to Vendor, same link-field
-- pattern as Client/Invoice (src/lib/quickbooks/sync/vendors.ts). Purely additive.

-- AlterEnum
ALTER TYPE "QboSyncEntityType" ADD VALUE 'VENDOR';

-- AlterTable
ALTER TABLE "Vendor" ADD COLUMN     "qboSyncToken" TEXT,
ADD COLUMN     "qboVendorId" TEXT;

