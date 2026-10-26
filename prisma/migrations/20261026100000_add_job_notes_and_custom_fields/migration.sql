-- CreateEnum
CREATE TYPE "JobCustomFieldType" AS ENUM ('TEXT', 'CHECKBOX');

-- AlterTable
ALTER TABLE "Job" ADD COLUMN     "fundedByLoan" BOOLEAN,
ADD COLUMN     "notesInternal" TEXT,
ADD COLUMN     "notesSubs" TEXT;

-- CreateTable
CREATE TABLE "JobCustomFieldDef" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "JobCustomFieldType" NOT NULL DEFAULT 'TEXT',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JobCustomFieldDef_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "JobCustomFieldDef_organizationId_name_key" ON "JobCustomFieldDef"("organizationId", "name");

-- AddForeignKey
ALTER TABLE "JobCustomFieldDef" ADD CONSTRAINT "JobCustomFieldDef_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
