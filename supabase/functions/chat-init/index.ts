import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const FREE_MONTHLY_LIMIT = 50;
const SHOP_DOMAIN_RE = /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const { shop, cartId, cartValue } = await req.json() as {
      shop: string;
      cartId: string;
      cartValue: number;
    };

    if (!shop || !SHOP_DOMAIN_RE.test(shop)) {
      return json({ error: "Invalid or missing shop domain" }, 400);
    }
    if (!cartId || typeof cartId !== "string") {
      return json({ error: "Missing cartId" }, 400);
    }
    if (typeof cartValue !== "number" || cartValue <= 0 || cartValue > 999999) {
      return json({ error: "cartValue must be a positive number under 1,000,000" }, 400);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Load merchant settings — widget must be enabled
    const { data: settings } = await supabase
      .from("MerchantSettings")
      .select("isWidgetEnabled, aiPersonaName, greetingMessage")
      .eq("shop", shop)
      .single();

    if (!settings?.isWidgetEnabled) {
      return json({ allowed: false, reason: "widget_disabled" });
    }

    // Upsert UsageRecord and get current state
    let { data: usage } = await supabase
      .from("UsageRecord")
      .select("billingPlan, chatInitiationsThisMonth, totalChatsAllTime, billingCycleStart")
      .eq("shop", shop)
      .single();

    if (!usage) {
      const { data: created } = await supabase
        .from("UsageRecord")
        .insert({ shop })
        .select("billingPlan, chatInitiationsThisMonth, totalChatsAllTime, billingCycleStart")
        .single();
      usage = created;
    }

    // Reset billing cycle if older than 30 days
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    if (usage && new Date(usage.billingCycleStart) < thirtyDaysAgo) {
      const { data: reset } = await supabase
        .from("UsageRecord")
        .update({ chatInitiationsThisMonth: 0, billingCycleStart: new Date().toISOString() })
        .eq("shop", shop)
        .select("billingPlan, chatInitiationsThisMonth, totalChatsAllTime, billingCycleStart")
        .single();
      usage = reset;
    }

    // Check usage cap
    const isPaid = usage?.billingPlan === "paid";
    const used = usage?.chatInitiationsThisMonth ?? 0;
    const allowed = isPaid || used < FREE_MONTHLY_LIMIT;

    if (!allowed) {
      return json({ allowed: false, reason: "usage_cap_reached" });
    }

    // Create the chat session
    const { data: session, error: sessionError } = await supabase
      .from("ChatSession")
      .insert({
        shop,
        cartId,
        cartValueAtStart: cartValue,
        status: "active",
        messages: [],
      })
      .select("id")
      .single();

    if (sessionError || !session) {
      throw new Error(sessionError?.message ?? "Failed to create chat session");
    }

    // Increment usage counters
    await supabase
      .from("UsageRecord")
      .update({
        chatInitiationsThisMonth: (usage?.chatInitiationsThisMonth ?? 0) + 1,
        totalChatsAllTime: (usage?.totalChatsAllTime ?? 0) + 1,
      })
      .eq("shop", shop);

    return json({
      allowed: true,
      sessionId: session.id,
      greeting: settings.greetingMessage,
      aiPersonaName: settings.aiPersonaName,
    });
  } catch (err) {
    console.error("chat-init error:", err);
    return json({ error: "Internal server error" }, 500);
  }
});
