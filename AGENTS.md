# Kaahu OS project handoff

## Product and safety boundaries

- Kaahu OS is a Next.js 14 App Router dashboard that combines live Shopify sales data with Meta Ads performance data.
- The connected Shopify store is the live `d68c2f-18.myshopify.com` store. All Shopify work in this project must remain read-only unless the user explicitly changes that requirement.
- Never print, commit, or expose credentials or contents of `.env.local`. Keep all integrations server-side and preserve `.env.local` in `.gitignore`.
- The production deployment is `https://kaahu-os.vercel.app/`. It currently has no application login, so treat authentication as an important pending item before broadly sharing the URL.

## Current integrations

- Shopify is implemented in `lib/shopify.ts` and `app/api/shopify/route.ts` using the client-credentials flow with automatic temporary-token renewal.
- Shopify reporting excludes cancelled orders, test orders, and zero-dollar orders. Zero-dollar orders are UGC/collaboration orders and must stay excluded from revenue and order counts.
- Historical Shopify data has been extended into the reporting database. Dashboard reads may use the full stored date range; keep direct Shopify access read-only.
- Meta is implemented in `lib/meta.ts`, `app/api/meta/route.ts`, `app/api/meta/drilldown/route.ts`, and `app/api/meta/markets/route.ts`.
- Meta funnel actions are deduplicated using canonical pixel actions. Campaign rows expand to ad sets, and ad-set rows expand to ads.
- Geographic reporting supports Meta `region` for State and `comscore_market` for Comscore markets. Meta suppresses conversion metrics for these geographic breakdowns on this account, so geographic reporting shows spend, share, impressions, link clicks, CTR, and CPM—not geographic ROAS.

## Current dashboard behavior

- The main UI is `components/Dashboard.tsx`.
- Date controls support 7-, 30-, 60-, 90-, 180-, and 365-day presets plus unrestricted custom From/To dates, and retain the last applied range across refreshes.
- The Orders KPI opens a high-level order drawer showing order number/date, products and variants, quantities, totals/statuses, sales channel, and destination city/state/country. Do not add customer names, street addresses, email addresses, or phone numbers without an explicit requirement and privacy review.
- Campaign, ad-set, ad, and geographic tables are sortable. Expanded geographic results remain in a bounded scrolling panel.
- Sample/fallback data lives in `lib/sample-data.ts`; do not silently substitute sample data in a way that could be mistaken for live reporting.

## Environment variables

- Required names are documented in `.env.example`: `SHOPIFY_STORE`, `SHOPIFY_API_KEY`, `SHOPIFY_API_SECRET`, `META_ACCESS_TOKEN`, and `META_AD_ACCOUNT_ID`.
- `META_API_VERSION` is optional and currently defaults in code when omitted.
- `SHOPIFY_ACCESS_TOKEN` is optionally supported; otherwise the Shopify client credentials are used.
- Vercel environment-variable changes only affect new deployments, so redeploy after changing them.

## Development workflow

- Use `npm run dev` for local development. If port 3000 is occupied, Next.js may select another port; report the actual active URL.
- After every substantial code or configuration change, restart the local development server, confirm the application is reachable, and report the active local URL in the final handoff.
- Before committing substantive changes, run `npm run typecheck`, `npm run lint`, `npm run build`, and `git diff --check` when practical.
- Preserve unrelated user changes in a dirty worktree. Never commit `.env.local` or generated secrets.
- The GitHub remote is `https://github.com/ashutoshchaudhary79/kaahu-os.git`, with `main` as the tracked branch.

## Pending direction

- The next major security feature discussed is Google OAuth without a database, using a signed JWT session and an email allowlist. Authentication has not been implemented yet.
- If implementing it, protect both dashboard pages and every data API route; do not guard only the visible UI.
