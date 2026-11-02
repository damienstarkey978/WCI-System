-- Job-level cache for staff-confirmed Duval parcel lock (address → ArcGIS/PAO).
-- Values are never invented — only written after Confirm.

ALTER TABLE "Job" ADD COLUMN "parcelId" TEXT;
ALTER TABLE "Job" ADD COLUMN "ownerOfRecord" TEXT;
ALTER TABLE "Job" ADD COLUMN "legalDescription" TEXT;
ALTER TABLE "Job" ADD COLUMN "parcelConfirmedAt" TIMESTAMP(3);
ALTER TABLE "Job" ADD COLUMN "parcelSnapshot" JSONB;
