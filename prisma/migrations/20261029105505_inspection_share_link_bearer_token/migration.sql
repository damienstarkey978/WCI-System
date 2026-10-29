-- Allow staff to re-copy a durable inspector share URL without rotating the link.
ALTER TABLE "InspectionPictureShareLink" ADD COLUMN "bearerToken" TEXT;
