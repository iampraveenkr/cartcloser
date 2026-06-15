import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function createShopifyDiscountCode(
  shop: string,
  accessToken: string,
  discountPercent: number,
  cartValue: number,
): Promise<string> {
  const code = `CARTCLOSER-${crypto.randomUUID().replace(/-/g, "").slice(0, 8).toUpperCase()}`;
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
    signal: AbortSignal.timeout(10000),
  });

  const data = await res.json();
  const result = data?.data?.discountCodeBasicCreate;
  const errors = result?.userErrors;
  if (errors?.length) {
    throw new Error(`Shopify error: ${errors.map((e: { message: string }) => e.message).join(", ")}`);
  }
  if (!result?.codeDiscountNode) {
    throw new Error("Shopify returned no discount node");
  }

  return code;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const { sessionId, agreedDiscountPercent } = await req.json() as {
      sessionId: string;
      agreedDiscountPercent: number;
    };

    if (!sessionId || typeof sessionId !== "string") {
      return json({ error: "Missing sessionId" }, 400);
    }
    if (
      typeof agreedDiscountPercent !== "number" ||
      agreedDiscountPercent <= 0 ||
      agreedDiscountPercent > 100
    ) {
      return json({ error: "agreedDiscountPercent must be between 1 and 100" }, 400);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Atomically lock the session: only succeeds if status is currently "active"
    const { data: locked } = await supabase
      .from("ChatSession")
      .update({ status: "converting" })
      .eq("id", sessionId)
      .eq("status", "active")
      .select("id, shop, cartValueAtStart")
      .single();

    if (!locked) {
      return json({ error: "Session not found or already converted" }, 409);
    }

    let discountCode: string | undefined;

    try {
      // Load the shop's offline access token
      const { data: shopSession } = await supabase
        .from("Session")
        .select("accessToken")
        .eq("shop", locked.shop)
        .eq("isOnline", false)
        .order("expires", { ascending: false })
        .limit(1)
        .single();

      if (!shopSession?.accessToken) {
        throw new Error(`No offline access token found for shop ${locked.shop}`);
      }

      // Enforce the merchant's max discount cap
      const { data: settings } = await supabase
        .from("MerchantSettings")
        .select("maxDiscountPercent")
        .eq("shop", locked.shop)
        .single();

      const maxDiscount = settings?.maxDiscountPercent ?? 10;
      const finalDiscount = Math.min(agreedDiscountPercent, maxDiscount);

      // Create the Shopify discount code
      discountCode = await createShopifyDiscountCode(
        locked.shop,
        shopSession.accessToken,
        finalDiscount,
        locked.cartValueAtStart,
      );

      // 3% commission on the recovered cart value
      const recoveredValue = locked.cartValueAtStart * (1 - finalDiscount / 100);
      const commissionAmount = Math.round(recoveredValue * 0.03 * 100) / 100;

      // Mark session as converted
      await supabase
        .from("ChatSession")
        .update({ status: "converted", agreedDiscountPercent: finalDiscount, discountCode, commissionAmount })
        .eq("id", sessionId);

      // Update usage record
      const { data: usage } = await supabase
        .from("UsageRecord")
        .select("totalConversions, totalCommissionBilled")
        .eq("shop", locked.shop)
        .single();

      await supabase
        .from("UsageRecord")
        .update({
          totalConversions: (usage?.totalConversions ?? 0) + 1,
          totalCommissionBilled:
            Math.round(((usage?.totalCommissionBilled ?? 0) + commissionAmount) * 100) / 100,
        })
        .eq("shop", locked.shop);

      return json({ discountCode, commissionAmount });
    } catch (innerErr) {
      // Roll back the lock so the session can be retried
      await supabase
        .from("ChatSession")
        .update({ status: "active" })
        .eq("id", sessionId);
      throw innerErr;
    }
  } catch (err) {
    console.error("chat-convert error:", err);
    return json({ error: "Internal server error" }, 500);
  }
});
