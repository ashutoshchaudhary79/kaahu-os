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

## Meta API

`GET /api/meta` returns daily spend, a deduplicated paid funnel, purchase value, and campaign metrics for the selected range. It uses the ad account attribution settings and requires `META_ACCESS_TOKEN` with `ads_read` access.

`GET /api/meta/markets` returns the all-campaign geographic spend breakdown. Pass `dimension=comscore` for Meta's current `comscore_market` dimension or `dimension=state` for Meta's `region` breakdown. The dashboard displays spend share, impressions, link clicks, CTR, and CPM. Meta suppresses conversion metrics at these geographic breakdowns for this account, so the panel does not imply geographic ROAS.
