-- CreateEnum
CREATE TYPE "LineItemConfidence" AS ENUM ('HIGH', 'MEDIUM', 'LOW');

-- CreateEnum
CREATE TYPE "LineItemPriceSource" AS ENUM ('CATALOG', 'MARKET_RATE', 'MANUAL');

-- AlterEnum
ALTER TYPE "FileCategory" ADD VALUE 'PRESALE_PHOTO';

-- AlterTable
ALTER TABLE "EstimateLineItem" ADD COLUMN     "confidence" "LineItemConfidence",
ADD COLUMN     "priceSource" "LineItemPriceSource";
