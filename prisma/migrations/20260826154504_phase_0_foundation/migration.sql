-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'PM', 'OFFICE', 'FIELD', 'AGENT');

-- CreateEnum
CREATE TYPE "AgentKind" AS ENUM ('JARVIS', 'HEATHER', 'DUKE', 'HANK', 'VINCE', 'NEIL');

-- CreateEnum
CREATE TYPE "ContractType" AS ENUM ('FIXED_PRICE', 'OPEN_BOOK');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('PRE_SALE', 'OPEN', 'WARRANTY', 'CLOSED');

-- CreateEnum
CREATE TYPE "CostType" AS ENUM ('LABOR', 'MATERIAL', 'EQUIPMENT', 'SUBCONTRACTOR', 'OTHER', 'NONE');

-- CreateEnum
CREATE TYPE "ScheduleScope" AS ENUM ('ASSIGNED_ONLY', 'ALL_ITEMS');

-- CreateTable
CREATE TABLE "Organization" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "clerkOrgId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "clerkUserId" TEXT,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "role" "UserRole" NOT NULL DEFAULT 'FIELD',
    "agentKind" "AgentKind",
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobGroup" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JobGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Job" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "jobGroupId" TEXT,
    "prefix" TEXT,
    "name" TEXT NOT NULL,
    "contractType" "ContractType" NOT NULL,
    "status" "JobStatus" NOT NULL DEFAULT 'PRE_SALE',
    "addressLine1" TEXT,
    "addressLine2" TEXT,
    "city" TEXT,
    "state" TEXT,
    "postalCode" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "sqft" INTEGER,
    "permitNumber" TEXT,
    "lotInfo" TEXT,
    "projectedStart" TIMESTAMP(3),
    "projectedEnd" TIMESTAMP(3),
    "actualStart" TIMESTAMP(3),
    "actualEnd" TIMESTAMP(3),
    "scheduleColor" TEXT,
    "customFields" JSONB NOT NULL DEFAULT '{}',
    "isTemplate" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Job_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobStatusEvent" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "from" "JobStatus",
    "to" "JobStatus" NOT NULL,
    "actorUserId" TEXT,
    "actorApiKeyId" TEXT,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JobStatusEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobAccessGrant" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "scheduleScope" "ScheduleScope" NOT NULL DEFAULT 'ASSIGNED_ONLY',
    "canViewPricing" BOOLEAN NOT NULL DEFAULT false,
    "canViewCostDetail" BOOLEAN NOT NULL DEFAULT false,
    "canManageSchedule" BOOLEAN NOT NULL DEFAULT false,
    "canApproveChangeOrders" BOOLEAN NOT NULL DEFAULT false,
    "canViewDocuments" BOOLEAN NOT NULL DEFAULT true,
    "canCommunicateWithClient" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JobAccessGrant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CostCode" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "defaultCostType" "CostType" NOT NULL DEFAULT 'NONE',
    "parentId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CostCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApiKey" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "agentKind" "AgentKind",
    "tokenId" TEXT NOT NULL,
    "hashedSecret" TEXT NOT NULL,
    "scopes" TEXT[],
    "rateLimitPerMinute" INTEGER NOT NULL DEFAULT 120,
    "lastUsedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ApiKey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OAuthClient" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "agentKind" "AgentKind",
    "clientId" TEXT NOT NULL,
    "hashedClientSecret" TEXT NOT NULL,
    "scopes" TEXT[],
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OAuthClient_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Organization_slug_key" ON "Organization"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Organization_clerkOrgId_key" ON "Organization"("clerkOrgId");

-- CreateIndex
CREATE UNIQUE INDEX "User_clerkUserId_key" ON "User"("clerkUserId");

-- CreateIndex
CREATE INDEX "User_organizationId_idx" ON "User"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "User_organizationId_email_key" ON "User"("organizationId", "email");

-- CreateIndex
CREATE INDEX "JobGroup_organizationId_idx" ON "JobGroup"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "JobGroup_organizationId_name_key" ON "JobGroup"("organizationId", "name");

-- CreateIndex
CREATE INDEX "Job_organizationId_status_idx" ON "Job"("organizationId", "status");

-- CreateIndex
CREATE INDEX "Job_jobGroupId_idx" ON "Job"("jobGroupId");

-- CreateIndex
CREATE UNIQUE INDEX "Job_organizationId_prefix_key" ON "Job"("organizationId", "prefix");

-- CreateIndex
CREATE INDEX "JobStatusEvent_jobId_createdAt_idx" ON "JobStatusEvent"("jobId", "createdAt");

-- CreateIndex
CREATE INDEX "JobAccessGrant_userId_idx" ON "JobAccessGrant"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "JobAccessGrant_jobId_userId_key" ON "JobAccessGrant"("jobId", "userId");

-- CreateIndex
CREATE INDEX "CostCode_organizationId_isActive_idx" ON "CostCode"("organizationId", "isActive");

-- CreateIndex
CREATE INDEX "CostCode_parentId_idx" ON "CostCode"("parentId");

-- CreateIndex
CREATE UNIQUE INDEX "CostCode_organizationId_code_key" ON "CostCode"("organizationId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "ApiKey_tokenId_key" ON "ApiKey"("tokenId");

-- CreateIndex
CREATE INDEX "ApiKey_organizationId_idx" ON "ApiKey"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "OAuthClient_clientId_key" ON "OAuthClient"("clientId");

-- CreateIndex
CREATE INDEX "OAuthClient_organizationId_idx" ON "OAuthClient"("organizationId");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobGroup" ADD CONSTRAINT "JobGroup_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Job" ADD CONSTRAINT "Job_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Job" ADD CONSTRAINT "Job_jobGroupId_fkey" FOREIGN KEY ("jobGroupId") REFERENCES "JobGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobStatusEvent" ADD CONSTRAINT "JobStatusEvent_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobStatusEvent" ADD CONSTRAINT "JobStatusEvent_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobStatusEvent" ADD CONSTRAINT "JobStatusEvent_actorApiKeyId_fkey" FOREIGN KEY ("actorApiKeyId") REFERENCES "ApiKey"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobAccessGrant" ADD CONSTRAINT "JobAccessGrant_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobAccessGrant" ADD CONSTRAINT "JobAccessGrant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CostCode" ADD CONSTRAINT "CostCode_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CostCode" ADD CONSTRAINT "CostCode_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "CostCode"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApiKey" ADD CONSTRAINT "ApiKey_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApiKey" ADD CONSTRAINT "ApiKey_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OAuthClient" ADD CONSTRAINT "OAuthClient_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
