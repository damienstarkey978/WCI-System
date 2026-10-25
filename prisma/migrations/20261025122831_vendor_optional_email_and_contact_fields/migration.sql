-- AlterTable
ALTER TABLE "Client" ADD COLUMN     "addressLine1" TEXT,
ADD COLUMN     "cellPhone" TEXT,
ADD COLUMN     "city" TEXT,
ADD COLUMN     "postalCode" TEXT,
ADD COLUMN     "state" TEXT;

-- AlterTable
ALTER TABLE "Vendor" ADD COLUMN     "cellPhone" TEXT,
ADD COLUMN     "divisions" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "primaryContact" TEXT,
ALTER COLUMN "email" DROP NOT NULL;
