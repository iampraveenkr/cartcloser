import prisma from "../db.server";

// ── MerchantSettings ──────────────────────────────────────────────────────────

export async function getOrCreateMerchantSettings(shop: string) {
  return prisma.merchantSettings.upsert({
    where: { shop },
    update: {},
    create: { shop },
  });
}

// ── UsageRecord ───────────────────────────────────────────────────────────────

export async function getOrCreateUsageRecord(shop: string) {
  return prisma.usageRecord.upsert({
    where: { shop },
    update: {},
    create: { shop },
  });
}

const FREE_MONTHLY_LIMIT = 50;

export async function checkUsageCap(
  shop: string,
): Promise<{ allowed: boolean; remaining: number | null; plan: string }> {
  let record = await getOrCreateUsageRecord(shop);

  // Reset the counter if the current billing cycle is older than 30 days
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  if (record.billingCycleStart < thirtyDaysAgo) {
    record = await prisma.usageRecord.update({
      where: { shop },
      data: {
        chatInitiationsThisMonth: 0,
        billingCycleStart: new Date(),
      },
    });
  }

  if (record.billingPlan === "paid") {
    return { allowed: true, remaining: null, plan: "paid" };
  }

  const used = record.chatInitiationsThisMonth;
  const remaining = Math.max(0, FREE_MONTHLY_LIMIT - used);
  return { allowed: remaining > 0, remaining, plan: record.billingPlan };
}

export async function incrementChatCount(shop: string) {
  return prisma.usageRecord.update({
    where: { shop },
    data: {
      chatInitiationsThisMonth: { increment: 1 },
      totalChatsAllTime: { increment: 1 },
    },
  });
}

export async function incrementConversionCount(shop: string) {
  return prisma.usageRecord.update({
    where: { shop },
    data: { totalConversions: { increment: 1 } },
  });
}

export async function recordCommissionBilled(shop: string, amount: number) {
  return prisma.usageRecord.update({
    where: { shop },
    data: { totalCommissionBilled: { increment: amount } },
  });
}

// ── Session helpers ───────────────────────────────────────────────────────────

export async function getShopAccessToken(shop: string): Promise<string | null> {
  const session = await prisma.session.findFirst({
    where: { shop, isOnline: false },
    select: { accessToken: true },
  });
  return session?.accessToken ?? null;
}
