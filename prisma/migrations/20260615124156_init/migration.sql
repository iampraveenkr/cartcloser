-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "isOnline" BOOLEAN NOT NULL DEFAULT false,
    "scope" TEXT,
    "expires" DATETIME,
    "accessToken" TEXT NOT NULL,
    "userId" BIGINT
);

-- CreateTable
CREATE TABLE "MerchantSettings" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "maxDiscountPercent" INTEGER NOT NULL DEFAULT 10,
    "aiPersonaName" TEXT NOT NULL DEFAULT 'Alex',
    "greetingMessage" TEXT NOT NULL DEFAULT 'Hey! I noticed you haven''t checked out yet. I''m authorised to get you a special deal today — want to see if we can work something out?',
    "isWidgetEnabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "ChatSession" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "cartId" TEXT NOT NULL,
    "cartValueAtStart" REAL NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "agreedDiscountPercent" INTEGER,
    "discountCode" TEXT,
    "commissionAmount" REAL,
    "messages" TEXT NOT NULL DEFAULT '[]',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "UsageRecord" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "billingPlan" TEXT NOT NULL DEFAULT 'free',
    "chatInitiationsThisMonth" INTEGER NOT NULL DEFAULT 0,
    "totalChatsAllTime" INTEGER NOT NULL DEFAULT 0,
    "totalConversions" INTEGER NOT NULL DEFAULT 0,
    "totalCommissionBilled" REAL NOT NULL DEFAULT 0,
    "billingCycleStart" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "shopifySubscriptionId" TEXT,
    "usageSubscriptionLineItemId" TEXT,
    "billingSetupComplete" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "MerchantSettings_shop_key" ON "MerchantSettings"("shop");

-- CreateIndex
CREATE UNIQUE INDEX "UsageRecord_shop_key" ON "UsageRecord"("shop");
