-- CreateTable
CREATE TABLE "ClientUpdateSummary" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "headline" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "highlights" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClientUpdateSummary_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ClientUpdateSummary_jobId_periodEnd_idx" ON "ClientUpdateSummary"("jobId", "periodEnd");

-- CreateIndex
CREATE INDEX "ClientUpdateSummary_organizationId_idx" ON "ClientUpdateSummary"("organizationId");

-- AddForeignKey
ALTER TABLE "ClientUpdateSummary" ADD CONSTRAINT "ClientUpdateSummary_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientUpdateSummary" ADD CONSTRAINT "ClientUpdateSummary_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;
