# Kaahu performance dashboard — design spec (v1)

**Owner:** Ashu (single user, no auth)
**Build tool:** Codex in VS Code
**Goal:** working combined Shopify + Meta dashboard in 1–2 days, extensible to GA4 and Klaviyo later

---

## 1. What this is

A local-first dashboard that answers one question at a glance: **is ad spend turning into revenue, and where is the funnel leaking?**

Phase 1 (this spec) pulls live from Shopify and Meta on page load — no database yet. Phase 2 adds Supabase for historical sync once the live version proves useful. This sequencing matches how you validated the manual export workflow before committing to Windsor.ai — same instinct, applied to the build.

---

## 2. Tech stack

| Layer | Choice | Why |
|---|---|---|
| Framework | Next.js 14 (App Router) + TypeScript | API routes double as a secure backend for your Shopify/Meta tokens — they never reach the browser. One codebase, one `npm run dev`, ships to Vercel later if you ever want it hosted. |
| Styling | Tailwind CSS | Fast for Codex to generate, easy to apply Kaahu's warm-neutral palette (eyebrow #7a6a52, sentence-case, restraint) directly to a data dashboard. |
| Charts | Tremor (`@tremor/react`) | Purpose-built for exactly this — KPI cards, trend lines, bar breakdowns — on top of Tailwind. Far less code than hand-rolling Recharts for a dashboard this shape. |
| Data (phase 1) | None — live API calls per page load | You said hybrid; no reason to stand up a database before you know the dashboard is useful daily. |
| Data (phase 2) | Supabase (Postgres) | Same instinct as Windsor.ai evaluation — add it once phase 1 proves out, not before. |
| Secrets | `.env.local` (gitignored) | Shopify token + Meta token never touch client-side code. |

**Why not Streamlit/Python:** it would be marginally faster to a first chart, but you lose the clean separation between "server holds the API keys" and "browser renders the UI" that Next.js API routes give you for free — and Codex handles Next.js well. If you find yourself fighting the JS setup in the first hour, Streamlit is a reasonable fallback; flag it and we can re-scope.

---

## 3. Data reality check (important — read before building)

Two things worth knowing before Codex starts pulling data, so the dashboard doesn't promise something the APIs can't deliver yet:

- **True site-wide conversion rate** (all sessions → all orders, not just paid traffic) requires GA4. Shopify's Admin REST/GraphQL API doesn't expose sessions data on non-Plus plans — the "sessions" numbers you see in the Shopify analytics dashboard aren't reliably available via API without ShopifyQL (Plus-only). **Don't build a fake conversion-rate metric on incomplete data.** Phase 1 conversion signal comes from the *Meta-side funnel* instead (below), which is fully available now.
- **Meta gives you its own funnel for free**: impressions → clicks → landing page views → add-to-cart → checkout initiated → purchase, all per campaign, via the Insights API's `actions` field. This is actually the more useful number right now — it isolates paid-traffic performance from organic, which is exactly your problem (converting cold ad traffic).

So the "combined view" for day 1–2 is: **Meta funnel + spend** next to **Shopify orders + revenue**, joined by date — not a single blended conversion-rate metric that hides which side is underperforming.

---

## 4. Core KPIs for the MVP dashboard

**Top row (KPI cards):**
- Total spend (Meta, date range)
- Total revenue (Shopify, date range)
- Blended ROAS (revenue ÷ spend)
- Orders (Shopify)
- AOV (Shopify)
- Blended CAC (spend ÷ orders) — flagged as directional, not exact, until GA4 attribution is in

**Chart 1 — Spend vs revenue over time**
Dual-line chart, daily, date-range selectable (default last 30 days).

**Chart 2 — Meta funnel**
Horizontal bar or step chart: impressions → clicks → LPV → ATC → checkout → purchase. This is where you'll actually see the cold-traffic drop-off you're trying to fix.

**Table — campaign breakdown**
Meta campaigns sorted by spend, columns: spend, impressions, CTR, CPC, purchases, ROAS, CPA. This is the "where's the leak" table.

---

## 5. Data model (design now, wire up in phase 2)

Even though phase 1 doesn't persist data, shaping the schema now means phase 2 is a sync job, not a redesign.

```
meta_insights_daily
  date, campaign_id, campaign_name, spend, impressions, clicks,
  link_clicks, landing_page_views, add_to_cart, checkout_initiated,
  purchases, purchase_value

shopify_orders
  order_id, created_at, total_price, customer_id, is_new_customer,
  discount_code, line_items_count

sync_log
  source (meta | shopify | ga4 | klaviyo), last_synced_at, status
```

When GA4 and Klaviyo get added later, they become new tables (`ga4_sessions_daily`, `klaviyo_campaign_stats`) — not changes to the existing ones.

---

## 6. API integration notes

**Shopify Admin API**
- Custom app in Shopify admin → Admin API access token (`shpat_...`)
- Scopes needed: `read_orders`, `read_products`
- Endpoint: REST `orders.json` with `created_at_min`/`created_at_max`, or GraphQL equivalent
- You already have live Shopify MCP access in this chat — worth reusing the same store/collection knowledge (duplicate collections like AVADA Best Sellers, `frontpage` Handbags) when filtering what counts as a "real" product in revenue breakdowns later.

**Meta Marketing API**
- Meta Business Suite → System user → long-lived access token
- Ad account ID (`act_...`)
- Endpoint: `/act_{ad_account_id}/insights` with `fields=spend,impressions,clicks,actions,action_values` and `time_range`
- `actions` array contains the funnel events (landing_page_view, add_to_cart, initiate_checkout, purchase) — parse by `action_type`

---

## 7. Folder structure

```
kaahu-dashboard/
  app/
    page.tsx                 → main dashboard page
    api/
      shopify/route.ts        → server-side Shopify fetch, returns JSON
      meta/route.ts            → server-side Meta fetch, returns JSON
  components/
    KpiCard.tsx
    SpendRevenueChart.tsx
    MetaFunnelChart.tsx
    CampaignTable.tsx
    DateRangePicker.tsx
  lib/
    shopify.ts                → Shopify API client + types
    meta.ts                   → Meta API client + types
  .env.local                  → SHOPIFY_STORE, SHOPIFY_ACCESS_TOKEN,
                                  META_ACCESS_TOKEN, META_AD_ACCOUNT_ID
```

---

## 8. Phased build plan

**Day 1**
1. `npx create-next-app@latest` with TypeScript + Tailwind
2. Install Tremor, set up `.env.local`
3. Build `/api/meta` and `/api/shopify` routes — hardcode last-30-days range, confirm real data comes back
4. Render 4 KPI cards (spend, revenue, ROAS, orders) with real numbers, no styling polish yet

**Day 2**
5. Add spend-vs-revenue chart and Meta funnel chart
6. Add campaign breakdown table
7. Add date range picker, wire it into both API calls
8. Apply Kaahu styling: warm neutral palette, sentence-case labels, restrained layout

**Phase 2 (later, not this sprint)**
- Add Supabase, write a daily sync (Vercel Cron or Supabase Edge Function) that writes into the schema above
- Switch dashboard reads from live API calls to Supabase queries — unlocks date ranges beyond each API's live-query limits and faster loads
- Add GA4 connector (for true site-wide conversion rate and sessions)
- Add Klaviyo connector (email performance alongside paid)

---

## 9. Codex kickoff prompt

Paste this into Codex once you're in the empty project folder:

> Build a Next.js 14 (App Router, TypeScript) dashboard called "Kaahu performance dashboard." Use Tailwind CSS and the Tremor component library (@tremor/react) for charts and KPI cards.
>
> Create two API routes:
> - `/api/shopify` — server-side only, reads `SHOPIFY_STORE` and `SHOPIFY_ACCESS_TOKEN` from env vars, calls the Shopify Admin REST API `orders.json` endpoint for a given date range (query params `from` and `to`), returns total revenue, order count, AOV, and a daily revenue series as JSON.
> - `/api/meta` — server-side only, reads `META_ACCESS_TOKEN` and `META_AD_ACCOUNT_ID` from env vars, calls the Meta Marketing API `/act_{ad_account_id}/insights` endpoint for the same date range, returns total spend, impressions, clicks, and funnel counts (landing_page_view, add_to_cart, initiate_checkout, purchase parsed from the `actions` array) plus a campaign-level breakdown array.
>
> Build the main dashboard page with:
> 1. A date range picker (default: last 30 days) that refetches both API routes on change
> 2. KPI cards: total spend, total revenue, blended ROAS (revenue/spend), orders, AOV, blended CAC (spend/orders)
> 3. A dual-line chart: daily spend vs daily revenue
> 4. A funnel chart: impressions → clicks → landing page views → add to cart → checkout initiated → purchases
> 5. A table of Meta campaigns sorted by spend, with columns: campaign name, spend, CTR, CPC, purchases, ROAS, CPA
>
> Styling: warm neutral tones, sentence-case labels throughout (not Title Case), clean and restrained — no heavy shadows or gradients. Keep components in separate files under /components. Put API client logic in /lib/shopify.ts and /lib/meta.ts with proper TypeScript types for the responses.
>
> Do not commit .env.local. Create a .env.example with the four required variable names as placeholders.

---

## 10. Open items for phase 2 (not blockers now)

- Windsor.ai vs custom GA4/Klaviyo connectors — revisit once phase 1 dashboard is in daily use
- New vs returning customer revenue split (needs Shopify customer history, not just order data)
- Reviews-gap tracking — separate from ad/funnel data, likely its own small module later
