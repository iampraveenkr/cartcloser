# CartCloser — Architecture Overview

CartCloser is a Shopify app that recovers abandoned carts using an AI negotiation widget.

## Architecture Decision: Supabase Backend

This project uses **Supabase** as the production backend (PostgreSQL database + Edge Functions).

| Layer | Runtime | Purpose |
|-------|---------|---------|
| Merchant admin UI | Remix Node.js (`/app/*` routes) | Settings dashboard, analytics, billing |
| Shopify auth & webhooks | Remix Node.js (`/auth/*`, `/webhooks`) | OAuth, HMAC-verified webhooks |
| Cart widget API | Supabase Edge Functions (`supabase/functions/`) | Customer-facing chat, AI negotiation |
| Database | Supabase PostgreSQL | All persistent state (via Prisma in Remix, supabase-js in Edge Functions) |

### Why this split

The Remix app MUST remain Node.js because `@shopify/shopify-app-remix` and `PrismaSessionStorage` are Node.js-only packages — they cannot run inside Deno-based Supabase Edge Functions.

The storefront widget API (chat init, AI negotiation, discount conversion) is customer-facing and has no Shopify admin auth requirement, making it a perfect fit for Supabase Edge Functions (global low-latency, Deno, scales to zero).

## Key files

| File | Purpose |
|------|---------|
| `prisma/schema.prisma` | Database schema (PostgreSQL provider) |
| `app/shopify.server.ts` | Shopify app init, PrismaSessionStorage config |
| `app/lib/db.server.ts` | Prisma helper functions used by Remix routes |
| `app/lib/billing.server.ts` | PLANS constants, commission calculator |
| `supabase/functions/chat-init/index.ts` | Widget: initialise a chat session, check usage cap |
| `supabase/functions/chat-message/index.ts` | Widget: relay message to OpenAI, return AI reply |
| `supabase/functions/chat-convert/index.ts` | Widget: create Shopify discount code, record commission |

## Environment variables

See `.env.example` for all required variables. Key Supabase variables:
- `DATABASE_URL` — PostgreSQL connection string from Supabase dashboard
- `SUPABASE_URL` — Project URL (used by Remix + Edge Functions)
- `SUPABASE_SERVICE_ROLE_KEY` — Server-side only; used by Remix and Edge Functions to bypass RLS
- `SUPABASE_ANON_KEY` — Public key; safe to embed in the storefront widget JS

## Supabase Edge Function API

All three functions live under `supabase/functions/` and are deployed with `supabase functions deploy`.

### `POST /functions/v1/chat-init`
Request: `{ shop: string, cartId: string, cartValue: number }`
Response: `{ sessionId: string, greeting: string, aiPersonaName: string, allowed: boolean }`

### `POST /functions/v1/chat-message`
Request: `{ sessionId: string, message: string }`
Response: `{ reply: string, agreedDiscountPercent?: number }`

### `POST /functions/v1/chat-convert`
Request: `{ sessionId: string, agreedDiscountPercent: number }`
Response: `{ discountCode: string, commissionAmount: number }`

## Database models

- **Session** — Shopify auth tokens (managed by `@shopify/shopify-app-session-storage-prisma`)
- **MerchantSettings** — Per-shop widget config (AI persona, discount cap, greeting)
- **ChatSession** — Individual cart recovery conversations with message history
- **UsageRecord** — Per-shop billing, monthly chat count, conversion tracking

## Billing model

- Free plan: 50 chat initiations/month, 3% commission on recovered carts, capped at $150/month
- Paid plan: $19/month flat + 3% commission, capped at $1000/month
- Commission is billed via Shopify App Usage Records (not Supabase)

## Local development setup

1. Copy `.env.example` to `.env` and fill in all values
2. `npm install`
3. `npx prisma migrate dev` (requires live Supabase DATABASE_URL)
4. `npm run dev` (starts Shopify CLI + Remix)
5. Edge Functions: `supabase start` then `supabase functions serve` for local testing
