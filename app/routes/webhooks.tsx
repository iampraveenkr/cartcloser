import type { ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "~/shopify.server";
import db from "~/db.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { topic, shop } = await authenticate.webhook(request);

  switch (topic) {
    case "APP_UNINSTALLED":
      await db.$transaction([
        db.chatSession.deleteMany({ where: { shop } }),
        db.usageRecord.deleteMany({ where: { shop } }),
        db.merchantSettings.deleteMany({ where: { shop } }),
        db.session.deleteMany({ where: { shop } }),
      ]);
      break;

    case "SHOP_REDACT":
      // Final GDPR deletion — sent 48 h after uninstall. Remove any remaining data.
      await db.$transaction([
        db.chatSession.deleteMany({ where: { shop } }),
        db.usageRecord.deleteMany({ where: { shop } }),
        db.merchantSettings.deleteMany({ where: { shop } }),
        db.session.deleteMany({ where: { shop } }),
      ]);
      break;

    case "CUSTOMERS_DATA_REQUEST":
    case "CUSTOMERS_REDACT":
      // No customer PII stored — chat sessions contain only negotiation text.
      break;

    default:
      throw new Response("Unhandled webhook topic", { status: 404 });
  }

  return new Response(null, { status: 200 });
};

export default function Webhooks() {
  return null;
}
