-- Calendar day of the daily log (Buildertrend logDate). Stored as DateTime;
-- new writes use UTC noon for the Y-M-D. Backfill from createdAt's UTC calendar day
-- at noon so existing import rows (often UTC midnight) keep the same calendar date.
ALTER TABLE "DailyLog" ADD COLUMN "logDate" TIMESTAMP(3);

UPDATE "DailyLog"
SET "logDate" = (
  date_trunc('day', "createdAt" AT TIME ZONE 'UTC') + interval '12 hours'
);

CREATE INDEX "DailyLog_jobId_logDate_idx" ON "DailyLog"("jobId", "logDate");
