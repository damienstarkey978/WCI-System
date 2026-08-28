-- CreateEnum
CREATE TYPE "JarvisActionStatus" AS ENUM ('PENDING', 'CONFIRMED', 'DECLINED');

-- CreateTable
CREATE TABLE "JarvisPendingAction" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "toolName" TEXT NOT NULL,
    "input" JSONB NOT NULL,
    "summary" TEXT NOT NULL,
    "status" "JarvisActionStatus" NOT NULL DEFAULT 'PENDING',
    "resultSummary" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "JarvisPendingAction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "JarvisPendingAction_conversationId_createdAt_idx" ON "JarvisPendingAction"("conversationId", "createdAt");

-- AddForeignKey
ALTER TABLE "JarvisPendingAction" ADD CONSTRAINT "JarvisPendingAction_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "JarvisConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
