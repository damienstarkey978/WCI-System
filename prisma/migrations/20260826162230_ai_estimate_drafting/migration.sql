-- AlterTable
ALTER TABLE "Estimate" ADD COLUMN     "aiGenerated" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "aiPromptNotes" TEXT;
