-- AlterEnum
ALTER TYPE "UserRole" ADD VALUE 'SALES_REP';

-- AlterTable User
ALTER TABLE "User" ADD COLUMN "canAccessJobFinancials" BOOLEAN;
ALTER TABLE "User" ADD COLUMN "inviteSentAt" TIMESTAMP(3);

-- AlterTable Job
ALTER TABLE "Job" ADD COLUMN "salespersonUserId" TEXT;

-- CreateTable
CREATE TABLE "RoleSiteAccess" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "role" "UserRole" NOT NULL,
    "canAccessSales" BOOLEAN NOT NULL DEFAULT true,
    "canAccessJobs" BOOLEAN NOT NULL DEFAULT true,
    "canAccessProjectManagement" BOOLEAN NOT NULL DEFAULT true,
    "canAccessFiles" BOOLEAN NOT NULL DEFAULT true,
    "canAccessMessaging" BOOLEAN NOT NULL DEFAULT true,
    "canAccessFinancials" BOOLEAN NOT NULL DEFAULT true,
    "canAccessReports" BOOLEAN NOT NULL DEFAULT true,
    "canAccessPeople" BOOLEAN NOT NULL DEFAULT true,
    "canAccessSettings" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RoleSiteAccess_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Job_salespersonUserId_idx" ON "Job"("salespersonUserId");

-- CreateIndex
CREATE INDEX "RoleSiteAccess_organizationId_idx" ON "RoleSiteAccess"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "RoleSiteAccess_organizationId_role_key" ON "RoleSiteAccess"("organizationId", "role");

-- AddForeignKey
ALTER TABLE "Job" ADD CONSTRAINT "Job_salespersonUserId_fkey" FOREIGN KEY ("salespersonUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoleSiteAccess" ADD CONSTRAINT "RoleSiteAccess_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill salesperson from converted leads' assignees
UPDATE "Job" j
SET "salespersonUserId" = l."assignedUserId"
FROM "Lead" l
WHERE l."convertedJobId" = j."id"
  AND l."assignedUserId" IS NOT NULL
  AND j."salespersonUserId" IS NULL;
