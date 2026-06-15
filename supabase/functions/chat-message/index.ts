import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface Message {
  role: "user" | "assistant" | "system";
  content: string;
}

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
    const { sessionId, message } = await req.json() as {
      sessionId: string;
      message: string;
    };

    if (!sessionId || typeof sessionId !== "string") {
      return json({ error: "Missing sessionId" }, 400);
    }
    if (!message || typeof message !== "string" || message.trim().length === 0) {
      return json({ error: "Missing message" }, 400);
    }
    if (message.length > 2000) {
      return json({ error: "Message exceeds 2000 character limit" }, 400);
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
      return json({ error: "Session not found" }, 404);
    }
    if (chatSession.status !== "active") {
      return json({ error: "Session is no longer active" }, 409);
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
      ? (chatSession.messages as Message[])
      : [];

    const systemPrompt =
      `You are ${personaName}, a friendly cart recovery specialist for an online store.\n` +
      `Your goal is to recover the customer's abandoned cart by negotiating a discount.\n` +
      `You are authorised to offer discounts up to ${maxDiscount}% off their total.\n\n` +
      `Rules:\n` +
      `- Start friendly and empathetic — acknowledge they may have hesitation\n` +
      `- Offer a small discount first (e.g. 5%) and increase only if needed, never exceed ${maxDiscount}%\n` +
      `- When the customer agrees to a discount, output this JSON on its own line and nothing else after it:\n` +
      `  {"agreed":true,"discountPercent":<number>}\n` +
      `- If the customer says they're not interested, respond naturally and wish them well\n` +
      `- Keep replies concise (2-3 sentences max)\n` +
      `- Never reveal you are an AI or that this is automated\n` +
      `- Never offer more than ${maxDiscount}% under any circumstances`;

    const messagesForAPI: Message[] = [
      { role: "system", content: systemPrompt },
      ...history,
      { role: "user", content: message.trim() },
    ];

    // Call OpenAI with an explicit timeout
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
      signal: AbortSignal.timeout(8000),
    });

    if (!openaiResponse.ok) {
      const errText = await openaiResponse.text();
      console.error("OpenAI error:", errText);
      throw new Error("OpenAI API call failed");
    }

    const openaiData = await openaiResponse.json();
    const aiReply: string = openaiData.choices[0].message.content;

    // Detect discount agreement in the AI response
    let agreedDiscountPercent: number | undefined;
    const agreementMatch = aiReply.match(/\{"agreed":true,"discountPercent":(\d+(\.\d+)?)\}/);
    if (agreementMatch) {
      const parsed = parseFloat(agreementMatch[1]);
      agreedDiscountPercent = Math.min(parsed, maxDiscount);
    }

    // Persist updated message history
    const updatedMessages: Message[] = [
      ...history,
      { role: "user", content: message.trim() },
      { role: "assistant", content: aiReply },
    ];

    await supabase
      .from("ChatSession")
      .update({ messages: updatedMessages })
      .eq("id", sessionId);

    // Strip the embedded JSON tag before returning the display text
    const displayReply = aiReply
      .replace(/\{"agreed":true,"discountPercent":\d+(\.\d+)?\}/, "")
      .trim();

    return json({
      reply: displayReply,
      ...(agreedDiscountPercent != null ? { agreedDiscountPercent } : {}),
    });
  } catch (err) {
    console.error("chat-message error:", err);
    return json({ error: "Internal server error" }, 500);
  }
});
