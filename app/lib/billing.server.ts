export const PLANS = {
  FREE: {
    name: "free",
    displayName: "Free",
    monthlyLimit: 50,
    recurringPrice: 0.00,          // USD per month
    commissionPercent: 3,          // % of recovered cart value
    usageCappedAmount: 150.00,     // Max commission Shopify will bill per month
    usageTerms: "3% commission on the recovered cart value of each closed sale.",
  },
  PAID: {
    name: "paid",
    displayName: "Paid — $19/month",
    monthlyLimit: null,            // Unlimited
    recurringPrice: 19.00,
    commissionPercent: 3,
    usageCappedAmount: 1000.00,
    usageTerms: "3% commission on the recovered cart value of each closed sale.",
  },
} as const;

export type PlanKey = keyof typeof PLANS;
export type PlanConfig = (typeof PLANS)[PlanKey];

export function getPlanConfig(planName: string): PlanConfig {
  return planName === "paid" ? PLANS.PAID : PLANS.FREE;
}

export function getPlanLimit(planName: string): number | null {
  return getPlanConfig(planName).monthlyLimit;
}

export function calculateCommission(
  cartValueAtStart: number,
  agreedDiscountPercent: number,
): number {
  const recoveredCartValue = cartValueAtStart * (1 - agreedDiscountPercent / 100);
  const commission = recoveredCartValue * 0.03;
  return Math.round(commission * 100) / 100;
}
