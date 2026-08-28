-- Backfill JobAccessGrant for FIELD-role staff based on jobs they've already
-- worked (a time clock entry, an authored daily log, or an assigned to-do/RFI),
-- so turning on real per-job access enforcement (src/lib/job-access.ts) does not
-- lock anyone out of a job they're actively on. Idempotent — safe to re-run.
-- Grants are documents-only by default (matches the FIELD role's "no pricing or
-- cost visibility" description); an admin can widen or add access from a staff
-- member's profile page (/staff/{userId}) going forward.
INSERT INTO "JobAccessGrant" (
  "id", "jobId", "userId", "scheduleScope",
  "canViewPricing", "canViewCostDetail", "canManageSchedule", "canApproveChangeOrders",
  "canViewDocuments", "canCommunicateWithClient", "createdAt", "updatedAt"
)
SELECT
  gen_random_uuid()::text, pairs."jobId", pairs."userId", 'ASSIGNED_ONLY',
  false, false, false, false,
  true, false, now(), now()
FROM (
  SELECT DISTINCT tce."jobId", tce."userId"
  FROM "TimeClockEntry" tce
  JOIN "User" u ON u.id = tce."userId" AND u.role = 'FIELD'

  UNION

  SELECT DISTINCT dl."jobId", dl."authorUserId" AS "userId"
  FROM "DailyLog" dl
  JOIN "User" u ON u.id = dl."authorUserId" AND u.role = 'FIELD'

  UNION

  SELECT DISTINCT t."jobId", t."assigneeUserId" AS "userId"
  FROM "Todo" t
  JOIN "User" u ON u.id = t."assigneeUserId" AND u.role = 'FIELD'
  WHERE t."assigneeUserId" IS NOT NULL

  UNION

  SELECT DISTINCT r."jobId", r."assigneeUserId" AS "userId"
  FROM "Rfi" r
  JOIN "User" u ON u.id = r."assigneeUserId" AND u.role = 'FIELD'
  WHERE r."assigneeUserId" IS NOT NULL
) AS pairs
ON CONFLICT ("jobId", "userId") DO NOTHING;
