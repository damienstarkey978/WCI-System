-- Allow headless inspector uploads (no staff User on the File row).
ALTER TABLE "File" ALTER COLUMN "uploadedByUserId" DROP NOT NULL;

-- Per-inspection share links for Inspection Pictures (view + upload, no login).
CREATE TABLE "InspectionPictureShareLink" (
    "id" TEXT NOT NULL,
    "inspectionId" TEXT NOT NULL,
    "label" TEXT,
    "tokenId" TEXT NOT NULL,
    "hashedSecret" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InspectionPictureShareLink_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "InspectionPictureShareLink_tokenId_key" ON "InspectionPictureShareLink"("tokenId");

CREATE INDEX "InspectionPictureShareLink_inspectionId_idx" ON "InspectionPictureShareLink"("inspectionId");

ALTER TABLE "InspectionPictureShareLink" ADD CONSTRAINT "InspectionPictureShareLink_inspectionId_fkey" FOREIGN KEY ("inspectionId") REFERENCES "JobPermitInspection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
