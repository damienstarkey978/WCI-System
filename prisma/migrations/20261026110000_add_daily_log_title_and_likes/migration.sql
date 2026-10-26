-- AlterTable
ALTER TABLE "DailyLog" ADD COLUMN     "title" TEXT;

-- CreateTable
CREATE TABLE "DailyLogLike" (
    "dailyLogId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DailyLogLike_pkey" PRIMARY KEY ("dailyLogId","userId")
);

-- AddForeignKey
ALTER TABLE "DailyLogLike" ADD CONSTRAINT "DailyLogLike_dailyLogId_fkey" FOREIGN KEY ("dailyLogId") REFERENCES "DailyLog"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyLogLike" ADD CONSTRAINT "DailyLogLike_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
