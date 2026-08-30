-- Phase 19: Job -> QBO sub-customer sync (task #18, CLAUDE.md 2.3's
-- "Sub-customers/Projects" row) — extends the sync log's entity type to JOB and adds
-- qboCustomerId/qboSyncToken to Job, same link-field pattern as Client/Invoice/Vendor
-- (src/lib/quickbooks/sync/jobs.ts). Purely additive.

-- AlterEnum
ALTER TYPE "QboSyncEntityType" ADD VALUE 'JOB';

-- AlterTable
ALTER TABLE "Job" ADD COLUMN     "qboCustomerId" TEXT,
ADD COLUMN     "qboSyncToken" TEXT;

