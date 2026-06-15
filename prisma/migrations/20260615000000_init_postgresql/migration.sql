-- CartCloser initial schema for Supabase PostgreSQL

CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "isOnline" BOOLEAN NOT NULL DEFAULT false,
    "scope" TEXT,
    "expires" TIMESTAMP(3),
    "accessToken" TEXT NOT NULL,
    "userId" BIGINT,
    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MerchantSettings" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "maxDiscountPercent" INTEGER NOT NULL DEFAULT 10,
    "aiPersonaName" TEXT NOT NULL DEFAULT 'Alex',
    "greetingMessage" TEXT NOT NULL DEFAULT 'Hey! I noticed you haven''t checked out yet. I''m authorised to get you a special deal today — want to see if we can work something out?',
    "isWidgetEnabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MerchantSettings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MerchantSettings_shop_key" ON "MerchantSettings"("shop");

CREATE TABLE "ChatSession" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "cartId" TEXT NOT NULL,
    "cartValueAtStart" DOUBLE PRECISION NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "agreedDiscountPercent" INTEGER,
    "discountCode" TEXT,
    "commissionAmount" DOUBLE PRECISION,
    "messages" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ChatSession_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "UsageRecord" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "billingPlan" TEXT NOT NULL DEFAULT 'free',
    "chatInitiationsThisMonth" INTEGER NOT NULL DEFAULT 0,
    "totalChatsAllTime" INTEGER NOT NULL DEFAULT 0,
    "totalConversions" INTEGER NOT NULL DEFAULT 0,
    "totalCommissionBilled" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "billingCycleStart" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "shopifySubscriptionId" TEXT,
    "usageSubscriptionLineItemId" TEXT,
    "billingSetupComplete" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "UsageRecord_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "UsageRecord_shop_key" ON "UsageRecord"("shop");
