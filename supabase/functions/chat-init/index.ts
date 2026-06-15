import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const FREE_MONTHLY_LIMIT = 50;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { shop, cartId, cartValue } = await req.json() as {
      shop: string;
      cartId: string;
      cartValue: number;
    };

    if (!shop || !cartId || cartValue == null) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: shop, cartId, cartValue" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
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
      return new Response(
        JSON.stringify({ allowed: false, reason: "widget_disabled" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
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
      return new Response(
        JSON.stringify({ allowed: false, reason: "usage_cap_reached" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
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

    return new Response(
      JSON.stringify({
        allowed: true,
        sessionId: session.id,
        greeting: settings.greetingMessage,
        aiPersonaName: settings.aiPersonaName,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("chat-init error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
