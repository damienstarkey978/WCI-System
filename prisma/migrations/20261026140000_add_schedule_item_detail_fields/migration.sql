-- AlterTable
ALTER TABLE "ScheduleItem" ADD COLUMN     "showOnGantt" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "ScheduleItem" ADD COLUMN     "displayColor" TEXT;
ALTER TABLE "ScheduleItem" ADD COLUMN     "isHourly" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "ScheduleItem" ADD COLUMN     "reminderDays" INTEGER;
ALTER TABLE "ScheduleItem" ADD COLUMN     "tags" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "ScheduleItem" ADD COLUMN     "notesInternal" TEXT;
ALTER TABLE "ScheduleItem" ADD COLUMN     "notesSubs" TEXT;
ALTER TABLE "ScheduleItem" ADD COLUMN     "notesClient" TEXT;
