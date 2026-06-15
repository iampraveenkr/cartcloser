import type {
  ActionFunctionArgs,
  LoaderFunctionArgs,
} from "@remix-run/node";
import { json } from "@remix-run/node";
import {
  Form,
  useActionData,
  useLoaderData,
  useRouteError,
} from "@remix-run/react";
import { useEffect, useState } from "react";
import { boundary } from "@shopify/shopify-app-remix/server";
import {
  BlockStack,
  Button,

  Card,
  Checkbox,
  FormLayout,
  Layout,
  Page,
  Text,
  TextField,
  Toast,
} from "@shopify/polaris";
import { authenticate } from "~/shopify.server";
import { getOrCreateMerchantSettings } from "~/lib/db.server";
import prisma from "~/db.server";

// ── Loader ────────────────────────────────────────────────────────────────────

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  try {
    const settings = await getOrCreateMerchantSettings(session.shop);
    return json({ settings });
  } catch {
    throw new Response("Database error", { status: 500 });
  }
};

// ── Action ────────────────────────────────────────────────────────────────────

type ActionResponse = {
  success: boolean;
  errors: Record<string, string>;
};

export const action = async ({
  request,
}: ActionFunctionArgs): Promise<Response> => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  const formData = await request.formData();
  const isWidgetEnabled = formData.get("isWidgetEnabled") === "on";
  const aiPersonaName = String(formData.get("aiPersonaName") ?? "").trim();
  const maxDiscountPercentRaw = String(
    formData.get("maxDiscountPercent") ?? "",
  );
  const greetingMessage = String(
    formData.get("greetingMessage") ?? "",
  ).trim();

  const errors: Record<string, string> = {};

  if (!aiPersonaName) {
    errors.aiPersonaName = "Agent name is required.";
  } else if (aiPersonaName.length > 30) {
    errors.aiPersonaName = "Agent name must be 30 characters or fewer.";
  }

  const maxDiscountPercent = parseInt(maxDiscountPercentRaw, 10);
  if (
    isNaN(maxDiscountPercent) ||
    maxDiscountPercent < 1 ||
    maxDiscountPercent > 50
  ) {
    errors.maxDiscountPercent = "Must be a whole number between 1 and 50.";
  }

  if (!greetingMessage) {
    errors.greetingMessage = "Opening message is required.";
  } else if (greetingMessage.length > 300) {
    errors.greetingMessage = "Opening message must be 300 characters or fewer.";
  }

  if (Object.keys(errors).length > 0) {
    return json<ActionResponse>({ success: false, errors }, { status: 400 });
  }

  try {
    await prisma.merchantSettings.upsert({
      where: { shop },
      update: { isWidgetEnabled, aiPersonaName, maxDiscountPercent, greetingMessage },
      create: { shop, isWidgetEnabled, aiPersonaName, maxDiscountPercent, greetingMessage },
    });
    return json<ActionResponse>({ success: true, errors: {} });
  } catch {
    return json<ActionResponse>(
      { success: false, errors: { form: "Failed to save settings. Please try again." } },
      { status: 500 },
    );
  }
};

// ── Component ─────────────────────────────────────────────────────────────────

export default function Settings() {
  const { settings } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();

  const [isWidgetEnabled, setIsWidgetEnabled] = useState(
    settings.isWidgetEnabled,
  );
  const [aiPersonaName, setAiPersonaName] = useState(settings.aiPersonaName);
  const [maxDiscountPercent, setMaxDiscountPercent] = useState(
    String(settings.maxDiscountPercent),
  );
  const [greetingMessage, setGreetingMessage] = useState(
    settings.greetingMessage,
  );
  const [showSavedToast, setShowSavedToast] = useState(false);

  useEffect(() => {
    if (actionData?.success) {
      setShowSavedToast(true);
    }
  }, [actionData]);

  const errors = actionData?.errors ?? {};

  return (
    <Page title="Settings">
      {showSavedToast && (
        <Toast
          content="Settings saved."
          onDismiss={() => setShowSavedToast(false)}
        />
      )}

      <Layout>
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              {errors.form && (
                <Text as="p" tone="critical">
                  {errors.form}
                </Text>
              )}
              <Form method="post">
                <FormLayout>
                  <Checkbox
                    name="isWidgetEnabled"
                    checked={isWidgetEnabled}
                    onChange={setIsWidgetEnabled}
                    label="Enable CartCloser chat widget on storefront"
                  />
                  <TextField
                    name="aiPersonaName"
                    label="AI Agent Name"
                    value={aiPersonaName}
                    onChange={setAiPersonaName}
                    helpText="Name shown in the chat header (e.g., 'Alex from CartCloser')"
                    maxLength={30}
                    showCharacterCount
                    error={errors.aiPersonaName}
                    autoComplete="off"
                  />
                  <TextField
                    name="maxDiscountPercent"
                    label="Maximum Discount Allowed (%)"
                    type="number"
                    value={maxDiscountPercent}
                    onChange={setMaxDiscountPercent}
                    min={1}
                    max={50}
                    helpText="This is a server-side hard limit. The AI can NEVER offer more than this percentage, regardless of what the customer asks."
                    error={errors.maxDiscountPercent}
                    autoComplete="off"
                  />
                  <TextField
                    name="greetingMessage"
                    label="Opening Message"
                    value={greetingMessage}
                    onChange={setGreetingMessage}
                    multiline={4}
                    maxLength={300}
                    showCharacterCount
                    helpText="The first message the AI sends when the widget opens."
                    error={errors.greetingMessage}
                    autoComplete="off"
                  />
                  <Button variant="primary" submit>
                    Save Settings
                  </Button>
                </FormLayout>
              </Form>
            </BlockStack>
          </Card>
        </Layout.Section>

        <Layout.Section variant="oneThird">
          <Card>
            <BlockStack gap="300">
              <Text as="h3" variant="headingSm">
                Pricing reminder
              </Text>
              <Text as="p" variant="bodyMd">
                CartCloser charges a{" "}
                <Text as="span" fontWeight="bold">
                  3% commission
                </Text>{" "}
                on the recovered cart value of every successful negotiation.
                This applies to all plans.
              </Text>
              <Text as="p" variant="bodyMd">
                <Text as="span" fontWeight="semibold">
                  Free plan:
                </Text>{" "}
                first 50 chat sessions per month are included.
              </Text>
              <Text as="p" variant="bodyMd">
                <Text as="span" fontWeight="semibold">
                  Paid plan ($19/month):
                </Text>{" "}
                unlimited chat sessions + same 3% commission.
              </Text>
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}

export function ErrorBoundary() {
  return boundary.error(useRouteError());
}
