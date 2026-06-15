import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useRouteError } from "@remix-run/react";
import { useState } from "react";
import { boundary } from "@shopify/shopify-app-remix/server";
import {
  Badge,
  Banner,
  BlockStack,
  Card,
  DataTable,
  EmptyState,
  InlineStack,
  Layout,
  Link,
  Page,
  ProgressBar,
  Text,
  Toast,
} from "@shopify/polaris";
import { authenticate } from "~/shopify.server";
import {
  getOrCreateMerchantSettings,
  getOrCreateUsageRecord,
} from "~/lib/db.server";
import prisma from "~/db.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  const url = new URL(request.url);
  const upgraded = url.searchParams.get("upgraded") === "true";
  const billingSetup = url.searchParams.get("billing_setup") === "true";

  try {
    const [settings, usage] = await Promise.all([
      getOrCreateMerchantSettings(shop),
      getOrCreateUsageRecord(shop),
    ]);

    const cycleStart = usage.billingCycleStart;

    const [conversionsThisMonth, recentConversions] = await Promise.all([
      prisma.chatSession.count({
        where: { shop, status: "converted", createdAt: { gte: cycleStart } },
      }),
      prisma.chatSession.findMany({
        where: { shop, status: "converted" },
        orderBy: { createdAt: "desc" },
        take: 10,
      }),
    ]);

    return json({
      settings,
      usage,
      conversionsThisMonth,
      recentConversions,
      upgraded,
      billingSetup,
    });
  } catch {
    throw new Response("Database error", { status: 500 });
  }
};

type LoaderData = Awaited<ReturnType<typeof loader>> extends Response
  ? never
  : Awaited<ReturnType<typeof loader>>;

export default function Index() {
  const {
    usage,
    conversionsThisMonth,
    recentConversions,
    upgraded,
    billingSetup,
  } = useLoaderData<typeof loader>();

  const [activeToast, setActiveToast] = useState<
    "upgraded" | "billing_setup" | null
  >(upgraded ? "upgraded" : billingSetup ? "billing_setup" : null);

  const used = usage.chatInitiationsThisMonth;
  const isPaid = usage.billingPlan === "paid";
  const atCapacity = !isPaid && used >= 50;
  const nearCapacity = !isPaid && used >= 45 && !atCapacity;

  const conversionRate =
    used > 0
      ? ((conversionsThisMonth / used) * 100).toFixed(1) + "%"
      : "—";

  const tableRows = recentConversions.map((s) => [
    new Date(s.createdAt).toLocaleDateString(),
    `$${s.cartValueAtStart.toFixed(2)}`,
    s.agreedDiscountPercent != null ? `${s.agreedDiscountPercent}%` : "—",
    s.commissionAmount != null ? `$${s.commissionAmount.toFixed(2)}` : "—",
    s.discountCode ?? "—",
  ]);

  const toastMarkup =
    activeToast === "upgraded" ? (
      <Toast
        content="Plan upgraded! Unlimited sessions now active."
        onDismiss={() => setActiveToast(null)}
      />
    ) : activeToast === "billing_setup" ? (
      <Toast
        content="Billing set up! CartCloser is now active."
        onDismiss={() => setActiveToast(null)}
      />
    ) : null;

  return (
    <Page title="CartCloser Dashboard">
      {toastMarkup}
      <BlockStack gap="500">
        {/* Billing setup required banner */}
        {!usage.billingSetupComplete && (
          <Banner
            title="Action required: Set up billing to activate CartCloser"
            tone="warning"
            action={{ content: "Set Up Billing (Free)", url: "/app/billing" }}
          >
            <p>
              CartCloser charges a 3% commission on recovered cart value. This
              applies to both the Free and Paid plan. You must confirm billing
              once so Shopify can process these charges. Your first 50 chat
              sessions are completely free.
            </p>
          </Banner>
        )}

        {/* Usage warning banners */}
        {usage.billingSetupComplete && atCapacity && (
          <Banner
            title="Your free chat sessions are used up for this month."
            tone="critical"
            action={{ content: "Upgrade — $19/month", url: "/app/billing" }}
          >
            <p>Your widget is paused. Upgrade to re-enable it.</p>
          </Banner>
        )}
        {usage.billingSetupComplete && nearCapacity && (
          <Banner
            title={`You've used ${used} of your 50 free chat sessions this month.`}
            tone="warning"
            action={{ content: "Upgrade Now", url: "/app/billing" }}
          >
            <p>Upgrade to the $19/month plan for unlimited sessions.</p>
          </Banner>
        )}

        <Layout>
          {/* Section 1 — Usage This Month */}
          <Layout.Section>
            <Card>
              <BlockStack gap="400">
                <InlineStack align="space-between" blockAlign="center">
                  <Text as="h2" variant="headingMd">
                    Usage This Month
                  </Text>
                  <Badge tone={isPaid ? "success" : undefined}>
                    {isPaid ? "Paid" : "Free"}
                  </Badge>
                </InlineStack>

                {isPaid ? (
                  <Text as="p" variant="bodyMd">
                    Unlimited sessions — {usage.totalChatsAllTime} all-time
                  </Text>
                ) : (
                  <BlockStack gap="200">
                    <ProgressBar
                      progress={Math.min(100, (used / 50) * 100)}
                      size="small"
                    />
                    <Text as="p" variant="bodySm" tone="subdued">
                      {used} / 50 sessions used
                    </Text>
                  </BlockStack>
                )}

                <Link url="/app/billing">Manage Plan</Link>
              </BlockStack>
            </Card>
          </Layout.Section>

          {/* Section 2 — Quick Stats */}
          <Layout.Section>
            <Layout>
              <Layout.Section variant="oneThird">
                <Card>
                  <BlockStack gap="200">
                    <Text as="h3" variant="headingSm">
                      Conversions This Month
                    </Text>
                    <Text as="p" variant="headingXl">
                      {conversionsThisMonth}
                    </Text>
                  </BlockStack>
                </Card>
              </Layout.Section>
              <Layout.Section variant="oneThird">
                <Card>
                  <BlockStack gap="200">
                    <Text as="h3" variant="headingSm">
                      Conversion Rate
                    </Text>
                    <Text as="p" variant="headingXl">
                      {conversionRate}
                    </Text>
                  </BlockStack>
                </Card>
              </Layout.Section>
              <Layout.Section variant="oneThird">
                <Card>
                  <BlockStack gap="200">
                    <Text as="h3" variant="headingSm">
                      Commission Billed All-Time
                    </Text>
                    <Text as="p" variant="headingXl">
                      ${usage.totalCommissionBilled.toFixed(2)}
                    </Text>
                    <Text as="p" variant="bodySm" tone="subdued">
                      3% of recovered cart value per closed deal
                    </Text>
                  </BlockStack>
                </Card>
              </Layout.Section>
            </Layout>
          </Layout.Section>

          {/* Section 3 — Recent Conversions */}
          <Layout.Section>
            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">
                  Recent Conversions
                </Text>
                {recentConversions.length === 0 ? (
                  <EmptyState
                    heading="No conversions yet"
                    image=""
                  >
                    <p>
                      Once your first deal closes, it will appear here.
                    </p>
                  </EmptyState>
                ) : (
                  <DataTable
                    columnContentTypes={[
                      "text",
                      "numeric",
                      "numeric",
                      "numeric",
                      "text",
                    ]}
                    headings={[
                      "Date",
                      "Cart Value",
                      "Discount Given",
                      "Commission Charged",
                      "Code Used",
                    ]}
                    rows={tableRows}
                  />
                )}
              </BlockStack>
            </Card>
          </Layout.Section>
        </Layout>
      </BlockStack>
    </Page>
  );
}

export function ErrorBoundary() {
  return boundary.error(useRouteError());
}
