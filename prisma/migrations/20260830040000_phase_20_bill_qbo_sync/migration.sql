-- Phase 20: Bill QuickBooks sync (task #18, CLAUDE.md 2.3) — the cost-code-to-
-- QuickBooks mapping this needed: CostCode.qboItemId, one lazily-created two-sided
-- QBO Item per cost code (src/lib/quickbooks/sync/cost-codes.ts), used on each Bill
-- line so Bills break out by cost code in QBO. Extends the sync log's entity type to
-- BILL and adds qboBillId/qboSyncToken to Bill. Purely additive.

-- AlterEnum
ALTER TYPE "QboSyncEntityType" ADD VALUE 'BILL';

-- AlterTable
ALTER TABLE "Bill" ADD COLUMN     "qboBillId" TEXT,
ADD COLUMN     "qboSyncToken" TEXT;

-- AlterTable
ALTER TABLE "CostCode" ADD COLUMN     "qboItemId" TEXT;

