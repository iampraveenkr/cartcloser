-- AlterTable
ALTER TABLE "ChatSession" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "MerchantSettings" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "UsageRecord" ALTER COLUMN "updatedAt" DROP DEFAULT;
