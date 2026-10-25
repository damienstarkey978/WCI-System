-- AlterTable
ALTER TABLE "Schedule" ADD COLUMN     "isDraft" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "isOnline" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "ScheduleItem" ADD COLUMN     "phaseId" TEXT;

-- CreateTable
CREATE TABLE "SchedulePhase" (
    "id" TEXT NOT NULL,
    "scheduleId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SchedulePhase_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SchedulePhase_scheduleId_sortOrder_idx" ON "SchedulePhase"("scheduleId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "SchedulePhase_scheduleId_name_key" ON "SchedulePhase"("scheduleId", "name");

-- CreateIndex
CREATE INDEX "ScheduleItem_phaseId_idx" ON "ScheduleItem"("phaseId");

-- AddForeignKey
ALTER TABLE "ScheduleItem" ADD CONSTRAINT "ScheduleItem_phaseId_fkey" FOREIGN KEY ("phaseId") REFERENCES "SchedulePhase"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchedulePhase" ADD CONSTRAINT "SchedulePhase_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "Schedule"("id") ON DELETE CASCADE ON UPDATE CASCADE;
