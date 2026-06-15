import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function createShopifyDiscountCode(
  shop: string,
  accessToken: string,
  discountPercent: number,
  cartValue: number,
): Promise<string> {
  const code = `CARTCLOSER-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
  const discountAmount = Math.round(cartValue * (discountPercent / 100) * 100) / 100;

  const mutation = `
    mutation discountCodeBasicCreate($basicCodeDiscount: DiscountCodeBasicInput!) {
      discountCodeBasicCreate(basicCodeDiscount: $basicCodeDiscount) {
        codeDiscountNode {
          id
          codeDiscount {
            ... on DiscountCodeBasic {
              codes(first: 1) { nodes { code } }
            }
          }
        }
        userErrors { field message }
      }
    }
  `;

  const variables = {
    basicCodeDiscount: {
      title: `CartCloser Recovery — ${discountPercent}% off`,
      code,
      startsAt: new Date().toISOString(),
      customerSelection: { all: true },
      customerGets: {
        value: { discountAmount: { amount: discountAmount.toFixed(2), appliesOnEachItem: false } },
        items: { all: true },
      },
      appliesOncePerCustomer: true,
      usageLimit: 1,
    },
  };

  const res = await fetch(`https://${shop}/admin/api/2024-10/graphql.json`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": accessToken,
    },
    body: JSON.stringify({ query: mutation, variables }),
  });

  const json = await res.json();
  const errors = json?.data?.discountCodeBasicCreate?.userErrors;
  if (errors?.length) {
    throw new Error(`Shopify error: ${errors.map((e: { message: string }) => e.message).join(", ")}`);
  }

  return code;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { sessionId, agreedDiscountPercent } = await req.json() as {
      sessionId: string;
      agreedDiscountPercent: number;
    };

    if (!sessionId || agreedDiscountPercent == null) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: sessionId, agreedDiscountPercent" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Load the chat session
    const { data: chatSession } = await supabase
      .from("ChatSession")
      .select("id, shop, cartValueAtStart, status")
      .eq("id", sessionId)
      .single();

    if (!chatSession) {
      return new Response(
        JSON.stringify({ error: "Session not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (chatSession.status !== "active") {
      return new Response(
        JSON.stringify({ error: "Session is no longer active" }),
        { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Load the shop's offline access token
    const { data: shopSession } = await supabase
      .from("Session")
      .select("accessToken")
      .eq("shop", chatSession.shop)
      .eq("isOnline", false)
      .order("id", { ascending: false })
      .limit(1)
      .single();

    if (!shopSession?.accessToken) {
      throw new Error(`No offline access token found for shop ${chatSession.shop}`);
    }

    // Enforce the merchant's max discount cap
    const { data: settings } = await supabase
      .from("MerchantSettings")
      .select("maxDiscountPercent")
      .eq("shop", chatSession.shop)
      .single();

    const maxDiscount = settings?.maxDiscountPercent ?? 10;
    const finalDiscount = Math.min(agreedDiscountPercent, maxDiscount);

    // Create the Shopify discount code
    const discountCode = await createShopifyDiscountCode(
      chatSession.shop,
      shopSession.accessToken,
      finalDiscount,
      chatSession.cartValueAtStart,
    );

    // 3% commission on the recovered cart value
    const recoveredValue = chatSession.cartValueAtStart * (1 - finalDiscount / 100);
    const commissionAmount = Math.round(recoveredValue * 0.03 * 100) / 100;

    // Mark session as converted
    await supabase
      .from("ChatSession")
      .update({
        status: "converted",
        agreedDiscountPercent: finalDiscount,
        discountCode,
        commissionAmount,
      })
      .eq("id", sessionId);

    // Update usage record: increment conversions, accumulate commission
    const { data: usage } = await supabase
      .from("UsageRecord")
      .select("totalConversions, totalCommissionBilled")
      .eq("shop", chatSession.shop)
      .single();

    await supabase
      .from("UsageRecord")
      .update({
        totalConversions: (usage?.totalConversions ?? 0) + 1,
        totalCommissionBilled: Math.round(((usage?.totalCommissionBilled ?? 0) + commissionAmount) * 100) / 100,
      })
      .eq("shop", chatSession.shop);

    return new Response(
      JSON.stringify({ discountCode, commissionAmount }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("chat-convert error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
