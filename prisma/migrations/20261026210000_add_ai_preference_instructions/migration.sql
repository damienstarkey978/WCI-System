-- CreateEnum
CREATE TYPE "AiPreferenceForType" AS ENUM ('ESTIMATE', 'PROPOSAL', 'DOCUMENT', 'CHANGE_ORDER', 'SCHEDULE');

-- CreateTable
CREATE TABLE "AiPreferenceInstruction" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "externalId" TEXT,
    "label" TEXT,
    "instruction" TEXT NOT NULL,
    "forType" "AiPreferenceForType" NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "appliesToChangeOrder" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiPreferenceInstruction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AiPreferenceInstruction_organizationId_forType_enabled_idx" ON "AiPreferenceInstruction"("organizationId", "forType", "enabled");

-- CreateIndex
CREATE UNIQUE INDEX "AiPreferenceInstruction_organizationId_externalId_key" ON "AiPreferenceInstruction"("organizationId", "externalId");

-- AddForeignKey
ALTER TABLE "AiPreferenceInstruction" ADD CONSTRAINT "AiPreferenceInstruction_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
