/**
 * Dev-only preview route — renders the dashboard UI with live DB data
 * without going through Shopify OAuth. Disabled in production.
 */
import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import { useState } from "react";
import polarisStyles from "@shopify/polaris/build/esm/styles.css?url";
import {
  AppProvider,
  Badge,
  Banner,
  BlockStack,
  Card,
  DataTable,
  EmptyState,
  Frame,
  InlineStack,
  Layout,
  Link,
  Navigation,
  Page,
  ProgressBar,
  Text,
  Toast,
} from "@shopify/polaris";
import { HomeIcon, SettingsIcon, CreditCardIcon } from "@shopify/polaris-icons";
import {
  getOrCreateMerchantSettings,
  getOrCreateUsageRecord,
} from "~/lib/db.server";
import prisma from "~/db.server";

export const links = () => [{ rel: "stylesheet", href: polarisStyles }];

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const shop = "test-shop.myshopify.com";
  const url = new URL(request.url);
  const page = url.searchParams.get("page") ?? "dashboard";

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

  return json({ settings, usage, conversionsThisMonth, recentConversions, page });
};

export default function Preview() {
  const { settings, usage, conversionsThisMonth, recentConversions, page } =
    useLoaderData<typeof loader>();
  const [activeToast, setActiveToast] = useState<string | null>(null);

  const used = usage.chatInitiationsThisMonth;
  const isPaid = usage.billingPlan === "paid";
  const atCapacity = !isPaid && used >= 50;
  const nearCapacity = !isPaid && used >= 45 && !atCapacity;
  const conversionRate =
    used > 0 ? ((conversionsThisMonth / used) * 100).toFixed(1) + "%" : "—";

  const tableRows = recentConversions.map((s) => [
    new Date(s.createdAt).toLocaleDateString(),
    `$${s.cartValueAtStart.toFixed(2)}`,
    s.agreedDiscountPercent != null ? `${s.agreedDiscountPercent}%` : "—",
    s.commissionAmount != null ? `$${s.commissionAmount.toFixed(2)}` : "—",
    s.discountCode ?? "—",
  ]);

  const remainingFree =
    usage.billingPlan === "free"
      ? String(Math.max(0, 50 - (usage.chatInitiationsThisMonth ?? 0)))
      : undefined;

  const nav = (
    <Navigation location="/preview">
      <Navigation.Section
        items={[
          { url: "/preview?page=dashboard", label: "Dashboard", icon: HomeIcon, exactMatch: true },
          { url: "/preview?page=settings", label: "Settings", icon: SettingsIcon },
          { url: "/preview?page=billing", label: "Billing", icon: CreditCardIcon, badge: remainingFree },
        ]}
      />
    </Navigation>
  );

  const dashboardContent = (
    <Page title="CartCloser Dashboard">
      {activeToast && (
        <Toast content={activeToast} onDismiss={() => setActiveToast(null)} />
      )}
      <BlockStack gap="500">
        {!usage.billingSetupComplete && (
          <Banner
            title="Action required: Set up billing to activate CartCloser"
            tone="warning"
            action={{ content: "Set Up Billing (Free)", url: "/preview?page=billing" }}
          >
            <p>
              CartCloser charges a 3% commission on recovered cart value.
              Your first 50 chat sessions are completely free.
            </p>
          </Banner>
        )}
        {usage.billingSetupComplete && atCapacity && (
          <Banner title="Your free chat sessions are used up for this month." tone="critical"
            action={{ content: "Upgrade — $19/month", url: "/preview?page=billing" }}>
            <p>Your widget is paused. Upgrade to re-enable it.</p>
          </Banner>
        )}
        {usage.billingSetupComplete && nearCapacity && (
          <Banner title={`You've used ${used} of your 50 free chat sessions this month.`}
            tone="warning" action={{ content: "Upgrade Now", url: "/preview?page=billing" }}>
            <p>Upgrade to the $19/month plan for unlimited sessions.</p>
          </Banner>
        )}

        <Layout>
          <Layout.Section>
            <Card>
              <BlockStack gap="400">
                <InlineStack align="space-between" blockAlign="center">
                  <Text as="h2" variant="headingMd">Usage This Month</Text>
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
                    <ProgressBar progress={Math.min(100, (used / 50) * 100)} size="small" />
                    <Text as="p" variant="bodySm" tone="subdued">
                      {used} / 50 sessions used
                    </Text>
                  </BlockStack>
                )}
                <Link url="/preview?page=billing">Manage Plan</Link>
              </BlockStack>
            </Card>
          </Layout.Section>

          <Layout.Section>
            <Layout>
              <Layout.Section variant="oneThird">
                <Card>
                  <BlockStack gap="200">
                    <Text as="h3" variant="headingSm">Conversions This Month</Text>
                    <Text as="p" variant="headingXl">{conversionsThisMonth}</Text>
                  </BlockStack>
                </Card>
              </Layout.Section>
              <Layout.Section variant="oneThird">
                <Card>
                  <BlockStack gap="200">
                    <Text as="h3" variant="headingSm">Conversion Rate</Text>
                    <Text as="p" variant="headingXl">{conversionRate}</Text>
                  </BlockStack>
                </Card>
              </Layout.Section>
              <Layout.Section variant="oneThird">
                <Card>
                  <BlockStack gap="200">
                    <Text as="h3" variant="headingSm">Commission Billed All-Time</Text>
                    <Text as="p" variant="headingXl">${usage.totalCommissionBilled.toFixed(2)}</Text>
                    <Text as="p" variant="bodySm" tone="subdued">
                      3% of recovered cart value per closed deal
                    </Text>
                  </BlockStack>
                </Card>
              </Layout.Section>
            </Layout>
          </Layout.Section>

          <Layout.Section>
            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">Recent Conversions</Text>
                {recentConversions.length === 0 ? (
                  <EmptyState heading="No conversions yet" image="">
                    <p>Once your first deal closes, it will appear here.</p>
                  </EmptyState>
                ) : (
                  <DataTable
                    columnContentTypes={["text", "numeric", "numeric", "numeric", "text"]}
                    headings={["Date", "Cart Value", "Discount Given", "Commission Charged", "Code Used"]}
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

  const settingsContent = (
    <Page title="Settings">
      <Layout>
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <Text as="h2" variant="headingMd">Widget Configuration</Text>
              <Text as="p" variant="bodyMd">
                <strong>Widget enabled:</strong> {settings.isWidgetEnabled ? "Yes" : "No"}
              </Text>
              <Text as="p" variant="bodyMd">
                <strong>AI agent name:</strong> {settings.aiPersonaName}
              </Text>
              <Text as="p" variant="bodyMd">
                <strong>Max discount:</strong> {settings.maxDiscountPercent}%
              </Text>
              <Text as="p" variant="bodyMd">
                <strong>Opening message:</strong> {settings.greetingMessage}
              </Text>
            </BlockStack>
          </Card>
        </Layout.Section>
        <Layout.Section variant="oneThird">
          <Card>
            <BlockStack gap="300">
              <Text as="h3" variant="headingSm">Pricing reminder</Text>
              <Text as="p" variant="bodyMd">
                CartCloser charges a <strong>3% commission</strong> on recovered cart value.
              </Text>
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );

  const billingContent = (
    <Page title="Billing">
      <Card>
        <BlockStack gap="200">
          <Text as="h2" variant="headingMd">Billing setup</Text>
          <Text as="p" variant="bodyMd">
            Billing setup — coming soon. Return after Phase 6 is complete.
          </Text>
        </BlockStack>
      </Card>
    </Page>
  );

  const content =
    page === "settings"
      ? settingsContent
      : page === "billing"
      ? billingContent
      : dashboardContent;

  return (
    <AppProvider i18n={{}}>
      <Frame navigation={nav}>{content}</Frame>
    </AppProvider>
  );
}
