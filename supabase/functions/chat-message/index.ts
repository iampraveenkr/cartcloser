import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface Message {
  role: "user" | "assistant" | "system";
  content: string;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { sessionId, message } = await req.json() as {
      sessionId: string;
      message: string;
    };

    if (!sessionId || !message) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: sessionId, message" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Load chat session
    const { data: chatSession, error: sessionError } = await supabase
      .from("ChatSession")
      .select("id, shop, cartValueAtStart, status, messages")
      .eq("id", sessionId)
      .single();

    if (sessionError || !chatSession) {
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

    // Load merchant settings for this shop
    const { data: settings } = await supabase
      .from("MerchantSettings")
      .select("aiPersonaName, maxDiscountPercent")
      .eq("shop", chatSession.shop)
      .single();

    const personaName = settings?.aiPersonaName ?? "Alex";
    const maxDiscount = settings?.maxDiscountPercent ?? 10;

    // Build message history
    const history: Message[] = Array.isArray(chatSession.messages)
      ? chatSession.messages as Message[]
      : [];

    const systemPrompt = `You are ${personaName}, a friendly cart recovery specialist for an online store.
Your goal is to recover the customer's abandoned cart by negotiating a discount that satisfies them.
You are authorised to offer discounts up to ${maxDiscount}% off their total.

Rules:
- Start friendly and empathetic — acknowledge they may have hesitation
- Offer a small discount first (e.g. 5%) and increase only if needed, never exceed ${maxDiscount}%
- When the customer agrees to a discount, respond with this exact JSON on its own line:
  {"agreed":true,"discountPercent":<number>}
- If the customer says they're not interested, respond naturally and wish them well
- Keep replies concise (2-3 sentences max)
- Never reveal you are an AI or that this is automated
- Never offer more than ${maxDiscount}% under any circumstances`;

    const messagesForAPI: Message[] = [
      { role: "system", content: systemPrompt },
      ...history,
      { role: "user", content: message },
    ];

    // Call OpenAI
    const openaiResponse = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${Deno.env.get("OPENAI_API_KEY")}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: messagesForAPI,
        temperature: 0.7,
        max_tokens: 300,
      }),
    });

    if (!openaiResponse.ok) {
      const err = await openaiResponse.text();
      console.error("OpenAI error:", err);
      throw new Error("OpenAI API call failed");
    }

    const openaiData = await openaiResponse.json();
    const aiReply: string = openaiData.choices[0].message.content;

    // Detect agreement in the AI response
    let agreedDiscountPercent: number | undefined;
    const agreementMatch = aiReply.match(/\{"agreed":true,"discountPercent":(\d+(\.\d+)?)\}/);
    if (agreementMatch) {
      const parsed = parseFloat(agreementMatch[1]);
      // Enforce the hard cap — never return more than merchant allows
      agreedDiscountPercent = Math.min(parsed, maxDiscount);
    }

    // Append both messages to history
    const updatedMessages: Message[] = [
      ...history,
      { role: "user", content: message },
      { role: "assistant", content: aiReply },
    ];

    await supabase
      .from("ChatSession")
      .update({ messages: updatedMessages })
      .eq("id", sessionId);

    // Strip the JSON agreement tag from the reply shown to the customer
    const displayReply = aiReply.replace(/\{"agreed":true,"discountPercent":\d+(\.\d+)?\}/, "").trim();

    return new Response(
      JSON.stringify({
        reply: displayReply,
        ...(agreedDiscountPercent != null ? { agreedDiscountPercent } : {}),
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("chat-message error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
