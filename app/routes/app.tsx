import type { HeadersFunction, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import {
  Outlet,
  useLoaderData,
  useLocation,
  useRouteError,
} from "@remix-run/react";
import { boundary } from "@shopify/shopify-app-remix/server";
import { AppProvider } from "@shopify/shopify-app-remix/react";
import polarisStyles from "@shopify/polaris/build/esm/styles.css?url";
import { Frame, Navigation } from "@shopify/polaris";
import { HomeIcon, SettingsIcon, CreditCardIcon } from "@shopify/polaris-icons";
import { authenticate } from "~/shopify.server";
import { getOrCreateUsageRecord } from "~/lib/db.server";

export const links = () => [{ rel: "stylesheet", href: polarisStyles }];

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);

  let usage = null;
  try {
    usage = await getOrCreateUsageRecord(session.shop);
  } catch {
    // non-fatal — nav renders without badge
  }

  return json({ apiKey: process.env.SHOPIFY_API_KEY ?? "", usage });
};

export default function App() {
  const { apiKey, usage } = useLoaderData<typeof loader>();
  const location = useLocation();

  const remainingFree =
    usage?.billingPlan === "free"
      ? String(Math.max(0, 50 - (usage.chatInitiationsThisMonth ?? 0)))
      : undefined;

  const navigationMarkup = (
    <Navigation location={location.pathname}>
      <Navigation.Section
        items={[
          {
            url: "/app",
            label: "Dashboard",
            icon: HomeIcon,
            exactMatch: true,
          },
          {
            url: "/app/settings",
            label: "Settings",
            icon: SettingsIcon,
          },
          {
            url: "/app/billing",
            label: "Billing",
            icon: CreditCardIcon,
            badge: remainingFree,
          },
        ]}
      />
    </Navigation>
  );

  return (
    <AppProvider isEmbeddedApp apiKey={apiKey}>
      <Frame navigation={navigationMarkup}>
        <Outlet />
      </Frame>
    </AppProvider>
  );
}

export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
