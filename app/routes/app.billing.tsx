import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useRouteError } from "@remix-run/react";
import { boundary } from "@shopify/shopify-app-remix/server";
import { BlockStack, Card, Page, Text } from "@shopify/polaris";
import { authenticate } from "~/shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  return json({});
};

export default function Billing() {
  return (
    <Page title="Billing">
      <Card>
        <BlockStack gap="200">
          <Text as="h2" variant="headingMd">
            Billing setup
          </Text>
          <Text as="p" variant="bodyMd">
            Billing setup — coming soon. Return after Phase 6 is complete.
          </Text>
        </BlockStack>
      </Card>
    </Page>
  );
}

export function ErrorBoundary() {
  return boundary.error(useRouteError());
}
