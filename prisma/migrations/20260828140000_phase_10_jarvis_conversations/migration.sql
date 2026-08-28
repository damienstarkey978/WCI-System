-- CreateEnum
CREATE TYPE "JarvisMessageRole" AS ENUM ('USER', 'ASSISTANT');

-- CreateTable
CREATE TABLE "JarvisConversation" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JarvisConversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JarvisMessage" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "role" "JarvisMessageRole" NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JarvisMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "JarvisConversation_organizationId_userId_updatedAt_idx" ON "JarvisConversation"("organizationId", "userId", "updatedAt");

-- CreateIndex
CREATE INDEX "JarvisMessage_conversationId_createdAt_idx" ON "JarvisMessage"("conversationId", "createdAt");

-- AddForeignKey
ALTER TABLE "JarvisConversation" ADD CONSTRAINT "JarvisConversation_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JarvisConversation" ADD CONSTRAINT "JarvisConversation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JarvisMessage" ADD CONSTRAINT "JarvisMessage_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "JarvisConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
