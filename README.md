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

The route uses Shopify's client-credentials flow and renews the temporary access token automatically. Cancelled and test orders are excluded; revenue uses each order's current total in the store currency.

## Meta API

`GET /api/meta` returns daily spend, a deduplicated paid funnel, purchase value, and campaign metrics for the selected range. It uses the ad account attribution settings and requires `META_ACCESS_TOKEN` with `ads_read` access.
