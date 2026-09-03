# Kaahu OS

Kaahu's local-first performance dashboard, combining Shopify revenue with Meta ad performance.

## Local development

1. Install dependencies with `npm install`.
2. Copy `.env.example` to `.env.local` and add the real credentials.
3. Start the app with `npm run dev`.
4. Open `http://localhost:3000`.

The current product direction is documented in `kaahu-dashboard-design-spec.md`; the original static layout reference is in `kaahu-dashboard-mockup.html`.

## Shopify API

`GET /api/shopify` returns revenue, order count, AOV, and daily revenue for the last 30 days. Pass `from` and `to` in `YYYY-MM-DD` format to choose another range:

```text
/api/shopify?from=2026-07-01&to=2026-07-31
```

The route uses Shopify's client-credentials flow and renews the temporary access token automatically. Cancelled, test, and zero-dollar orders are excluded; revenue uses each order's current total in the store currency.

The dashboard supports preset 7-, 30-, and 60-day ranges plus a custom From/To picker. Custom ranges are limited to 60 days to match the installed Shopify app's order-access window.

The dashboard's Orders KPI opens a sortable high-level order drawer for the selected date range. It shows order number, placed time, products and variants, item quantity, subtotal, discounts, total, financial and fulfillment status, destination city/state/country, and sales channel. It does not expose customer names, street addresses, emails, or phone numbers.

### Historical Shopify CSV import

Historical orders outside Shopify's API access window can be imported once from a Shopify **Export orders** CSV. Always preview the import first:

```bash
npm run import:shopify-csv -- /path/to/orders_export.csv --dry-run
npm run import:shopify-csv -- /path/to/orders_export.csv
```

The importer uses an RFC 4180 parser because quoted `Note Attributes` values can contain literal newlines. It groups line-item rows by `Name`, nets `Refunded Amount` out of `Total`, excludes cancelled and non-positive-total orders, normalizes financial and fulfillment statuses to lowercase, and preserves richer existing attribution and line-item data on overlap. Raw customer emails are never stored or logged; normalized emails are represented only by a SHA-256 `customer_hash`.

The export has no test-order flag, so test-order exclusion cannot be verified from CSV alone. It also has no numeric customer ID or UTM/referrer fields. Historical `customer_hash` values therefore do not automatically reconcile with the live API's `customer_id`, and native Facebook/Instagram checkout hints in `Note Attributes` are not treated as paid Meta attribution.

## Supabase data sync

Run one source or all sources over an explicit range, preview without writes, or resume with a three-day overlap from its latest successful `sync_runs` entry:

```bash
npm run sync -- --source=shopify --from=2026-08-30 --to=2026-09-02 --dry-run
npm run sync -- --source=meta --from=2026-08-30 --to=2026-09-02
npm run sync -- --source=all --since-last
```

Valid sources are `shopify`, `meta`, `ga4`, `klaviyo`, and `all`. Each source is isolated and logged independently so one failure does not prevent the others from running. Shopify is generally limited to the latest 60 days until `read_all_orders` is granted. Klaviyo campaign reports are fetched for the requested range, while flow-series reports are split into API-compatible windows and throttled automatically. All source credentials and the database connection remain server-side.

When the dashboard opens it immediately renders the latest Supabase snapshot while an overlap-safe incremental sync runs for all four sources in parallel. When that refresh finishes, the dashboard silently re-queries Supabase. Every dashboard report—including geographic and campaign drilldowns—is queried from Supabase rather than calling a vendor API. Concurrent startup requests share one in-process sync so development remounts do not duplicate vendor traffic.

## Meta API

`GET /api/meta` returns daily spend, a deduplicated paid funnel, purchase value, and campaign metrics for the selected range. It uses the ad account attribution settings and requires `META_ACCESS_TOKEN` with `ads_read` access.

`GET /api/meta/markets` returns the all-campaign geographic spend breakdown. Pass `dimension=comscore` for Meta's current `comscore_market` dimension or `dimension=state` for Meta's `region` breakdown. The dashboard displays spend share, impressions, link clicks, CTR, and CPM. Meta suppresses conversion metrics at these geographic breakdowns for this account, so the panel does not imply geographic ROAS.
