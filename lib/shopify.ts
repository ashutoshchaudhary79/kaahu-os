const SHOPIFY_API_VERSION = "2026-07";
const PAGE_SIZE = 100;
const MAX_PAGES = 100;

type Money = {
  amount: string;
  currencyCode: string;
};

type ShopifyOrder = {
  id: string;
  createdAt: string;
  cancelledAt: string | null;
  test: boolean;
  currentTotalPriceSet: { shopMoney: Money };
};

type OrdersPage = {
  shop: {
    currencyCode: string;
    ianaTimezone: string;
  };
  orders: {
    nodes: ShopifyOrder[];
    pageInfo: {
      hasNextPage: boolean;
      endCursor: string | null;
    };
  };
};

type GraphqlResponse<T> = {
  data?: T;
  errors?: Array<{ message: string }>;
};

export type DailyRevenue = {
  date: string;
  revenue: number;
  orders: number;
};

export type ShopifySummary = {
  source: "shopify";
  from: string;
  to: string;
  currency: string;
  timezone: string;
  revenue: number;
  orderCount: number;
  aov: number;
  daily: DailyRevenue[];
};

let cachedToken: { value: string; expiresAt: number } | null = null;

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function normalizeStore(store: string): string {
  return store.replace(/^https?:\/\//, "").replace(/\/$/, "");
}

async function getAccessToken(store: string): Promise<string> {
  const permanentToken = process.env.SHOPIFY_ACCESS_TOKEN?.trim();
  if (permanentToken) return permanentToken;

  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) {
    return cachedToken.value;
  }

  const response = await fetch(`https://${store}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: requiredEnv("SHOPIFY_API_KEY"),
      client_secret: requiredEnv("SHOPIFY_API_SECRET"),
    }),
    cache: "no-store",
  });

  const result = (await response.json()) as {
    access_token?: string;
    expires_in?: number;
    error_description?: string;
  };

  if (!response.ok || !result.access_token) {
    throw new Error(result.error_description ?? `Shopify authentication failed (${response.status})`);
  }

  cachedToken = {
    value: result.access_token,
    expiresAt: Date.now() + (result.expires_in ?? 86_400) * 1000,
  };
  return cachedToken.value;
}

async function shopifyGraphql<T>(store: string, token: string, query: string, variables: Record<string, unknown>): Promise<T> {
  const response = await fetch(`https://${store}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": token,
    },
    body: JSON.stringify({ query, variables }),
    cache: "no-store",
  });

  const result = (await response.json()) as GraphqlResponse<T>;
  if (!response.ok || result.errors?.length || !result.data) {
    const detail = result.errors?.map((error) => error.message).join("; ");
    throw new Error(detail || `Shopify API request failed (${response.status})`);
  }
  return result.data;
}

const ORDERS_QUERY = `#graphql
  query DashboardOrders($first: Int!, $after: String, $query: String!) {
    shop {
      currencyCode
      ianaTimezone
    }
    orders(first: $first, after: $after, query: $query, sortKey: CREATED_AT) {
      nodes {
        id
        createdAt
        cancelledAt
        test
        currentTotalPriceSet {
          shopMoney {
            amount
            currencyCode
          }
        }
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`;

function dateInTimezone(isoDate: string, timezone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(isoDate));
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export async function getShopifySummary(from: string, to: string): Promise<ShopifySummary> {
  const store = normalizeStore(requiredEnv("SHOPIFY_STORE"));
  const token = await getAccessToken(store);
  const searchQuery = `created_at:>=${from} created_at:<=${to} status:any`;

  let after: string | null = null;
  let page = 0;
  let shop: OrdersPage["shop"] | null = null;
  const orders: ShopifyOrder[] = [];

  do {
    if (++page > MAX_PAGES) throw new Error("Shopify order pagination exceeded the safety limit");
    const data: OrdersPage = await shopifyGraphql<OrdersPage>(store, token, ORDERS_QUERY, {
      first: PAGE_SIZE,
      after,
      query: searchQuery,
    });
    shop = data.shop;
    orders.push(...data.orders.nodes);
    after = data.orders.pageInfo.hasNextPage ? data.orders.pageInfo.endCursor : null;
  } while (after);

  if (!shop) throw new Error("Shopify did not return shop metadata");

  const included = orders.filter((order) => !order.cancelledAt && !order.test);
  const dailyMap = new Map<string, DailyRevenue>();
  let revenue = 0;

  for (const order of included) {
    const amount = Number(order.currentTotalPriceSet.shopMoney.amount);
    if (!Number.isFinite(amount)) continue;
    revenue += amount;
    const date = dateInTimezone(order.createdAt, shop.ianaTimezone);
    const current = dailyMap.get(date) ?? { date, revenue: 0, orders: 0 };
    current.revenue = roundMoney(current.revenue + amount);
    current.orders += 1;
    dailyMap.set(date, current);
  }

  const orderCount = included.length;
  return {
    source: "shopify",
    from,
    to,
    currency: shop.currencyCode,
    timezone: shop.ianaTimezone,
    revenue: roundMoney(revenue),
    orderCount,
    aov: orderCount ? roundMoney(revenue / orderCount) : 0,
    daily: Array.from(dailyMap.values()).sort((a, b) => a.date.localeCompare(b.date)),
  };
}
