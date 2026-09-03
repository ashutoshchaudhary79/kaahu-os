const SHOPIFY_API_VERSION = "2026-07";
const PAGE_SIZE = 100;
const MAX_PAGES = 100;

type Money = {
  amount: string;
  currencyCode: string;
};

type ShopifyOrder = {
  id: string;
  name: string;
  createdAt: string;
  cancelledAt: string | null;
  test: boolean;
  displayFinancialStatus: string;
  displayFulfillmentStatus: string;
  sourceName: string;
  discountCodes: string[];
  app: { name: string } | null;
  publication: { name: string } | null;
  currentSubtotalPriceSet: { shopMoney: Money };
  currentTotalDiscountsSet: { shopMoney: Money };
  currentTotalPriceSet: { shopMoney: Money };
  customer?: { id: string; email: string | null } | null;
  lineItems: { nodes: Array<{
    title: string;
    variantTitle: string | null;
    quantity: number;
    product?: { id: string } | null;
    variant?: { id: string } | null;
    originalUnitPriceSet: { shopMoney: Money };
  }> };
  shippingAddress: { name: string | null; city: string | null; provinceCode: string | null; countryCodeV2: string | null } | null;
  customerJourneySummary: {
    ready: boolean;
    daysToConversion: number | null;
    firstVisit: ShopifyCustomerVisit | null;
    lastVisit: ShopifyCustomerVisit | null;
  } | null;
};

type ShopifyCustomerVisit = {
  source: string;
  sourceDescription: string | null;
  referrerUrl: string | null;
  landingPage: string | null;
  referralCode: string | null;
  utmParameters: { source: string | null; medium: string | null; campaign: string | null; content: string | null; term: string | null } | null;
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
  extensions?: {
    cost?: {
      requestedQueryCost?: number;
      throttleStatus?: { currentlyAvailable: number; maximumAvailable: number; restoreRate: number };
    };
  };
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
  orders: ShopifyOrderSummary[];
  hasReadAllOrders: boolean;
};

export type ShopifyOrderSummary = {
  id: string;
  name: string;
  createdAt: string;
  itemQuantity: number;
  subtotal: number;
  discounts: number;
  total: number;
  financialStatus: string;
  fulfillmentStatus: string;
  channel: string;
  customer: string;
  discountCodes: string[];
  discountCode: string;
  attributionSource: string;
  attribution: {
    ready: boolean;
    daysToConversion: number | null;
    firstVisit: ShopifyCustomerVisit | null;
    lastVisit: ShopifyCustomerVisit | null;
  } | null;
  customerId: string | null;
  customerEmail: string | null;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  referringSite: string | null;
  landingSite: string | null;
  lineItems: Array<{
    productId: string | null;
    variantId: string | null;
    productTitle: string;
    variantTitle: string | null;
    quantity: number;
    price: number;
  }>;
  products: string;
  city: string;
  region: string;
  country: string;
};

let cachedToken: { value: string; expiresAt: number } | null = null;
let throttleStatus: { currentlyAvailable: number; restoreRate: number } | null = null;

const sleep = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));

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
  const estimatedCost = 100;
  if (throttleStatus && throttleStatus.currentlyAvailable < estimatedCost && throttleStatus.restoreRate > 0) {
    await sleep(Math.ceil(((estimatedCost - throttleStatus.currentlyAvailable) / throttleStatus.restoreRate) * 1000));
  }
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const response = await fetch(`https://${store}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": token },
      body: JSON.stringify({ query, variables }),
      cache: "no-store",
    });
    if (response.status === 429) {
      const retryAfter = Number(response.headers.get("retry-after") ?? 1);
      await sleep(Math.max(retryAfter, 0) * 1000);
      continue;
    }
    const result = (await response.json()) as GraphqlResponse<T>;
    const status = result.extensions?.cost?.throttleStatus;
    if (status) throttleStatus = { currentlyAvailable: status.currentlyAvailable, restoreRate: status.restoreRate };
    if (!response.ok || result.errors?.length || !result.data) {
      const detail = result.errors?.map((error) => error.message).join("; ");
      throw new Error(detail || `Shopify API request failed (${response.status})`);
    }
    return result.data;
  }
  throw new Error("Shopify API remained rate limited after retries");
}

function ordersQuery(includeCustomer: boolean, includeProducts: boolean) {
  return `#graphql
  query DashboardOrders($first: Int!, $after: String, $query: String!) {
    shop {
      currencyCode
      ianaTimezone
    }
    orders(first: $first, after: $after, query: $query, sortKey: CREATED_AT) {
      nodes {
        id
        name
        createdAt
        cancelledAt
        test
        displayFinancialStatus
        displayFulfillmentStatus
        sourceName
        discountCodes
        app { name }
        publication { name }
        ${includeCustomer ? "customer { id email }" : ""}
        customerJourneySummary {
          ready
          daysToConversion
          firstVisit {
            source
            sourceDescription
            referrerUrl
            landingPage
            referralCode
            utmParameters { source medium campaign content term }
          }
          lastVisit {
            source
            sourceDescription
            referrerUrl
            landingPage
            referralCode
            utmParameters { source medium campaign content term }
          }
        }
        currentSubtotalPriceSet {
          shopMoney { amount currencyCode }
        }
        currentTotalDiscountsSet {
          shopMoney { amount currencyCode }
        }
        currentTotalPriceSet {
          shopMoney {
            amount
            currencyCode
          }
        }
        lineItems(first: 100) {
          nodes {
            title variantTitle quantity
            ${includeProducts ? "product { id } variant { id }" : ""}
            originalUnitPriceSet { shopMoney { amount currencyCode } }
          }
        }
        shippingAddress { name city provinceCode countryCodeV2 }
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`;
}

export function dateInTimezone(isoDate: string, timezone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(isoDate));
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

function numericShopifyId(gid: string | null | undefined): string | null {
  return gid?.match(/\/(\d+)$/)?.[1] ?? null;
}

export async function getShopifyGrantedScopes(): Promise<string[]> {
  const store = normalizeStore(requiredEnv("SHOPIFY_STORE"));
  const token = await getAccessToken(store);
  const data = await shopifyGraphql<{ currentAppInstallation: { accessScopes: Array<{ handle: string }> } }>(
    store,
    token,
    `#graphql
      query GrantedScopes { currentAppInstallation { accessScopes { handle } } }
    `,
    {},
  );
  return data.currentAppInstallation.accessScopes.map((scope) => scope.handle);
}

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export const SOURCE_LABELS: Record<string, string> = {
  web: "Online Store",
  pos: "Point of Sale",
  shopify_draft_order: "Draft Order",
  iphone: "Shopify Mobile (iPhone)",
  android: "Shopify Mobile (Android)",
  mobile_app: "Mobile App",
};

export function normalizeShopifySalesChannel(sourceName: string): string {
  const normalized = sourceName.trim();
  if (SOURCE_LABELS[normalized]) return SOURCE_LABELS[normalized];
  if (/^\d+$/.test(normalized)) return `Legacy app (${normalized})`;
  return normalized || "Unknown source";
}

function orderChannel(order: ShopifyOrder): string {
  const publication = order.publication?.name.trim();
  if (publication) return publication;

  const app = order.app?.name.trim();
  if (app) return app;

  return normalizeShopifySalesChannel(order.sourceName);
}

export async function getShopifySummary(from: string, to: string): Promise<ShopifySummary> {
  const store = normalizeStore(requiredEnv("SHOPIFY_STORE"));
  const token = await getAccessToken(store);
  const scopes = await getShopifyGrantedScopes();
  const query = ordersQuery(scopes.includes("read_customers"), scopes.includes("read_products"));
  const searchQuery = `created_at:>=${from} created_at:<=${to} status:any`;

  let after: string | null = null;
  let page = 0;
  let shop: OrdersPage["shop"] | null = null;
  const orders: ShopifyOrder[] = [];

  do {
    if (++page > MAX_PAGES) throw new Error("Shopify order pagination exceeded the safety limit");
    const data: OrdersPage = await shopifyGraphql<OrdersPage>(store, token, query, {
      first: PAGE_SIZE,
      after,
      query: searchQuery,
    });
    shop = data.shop;
    orders.push(...data.orders.nodes);
    after = data.orders.pageInfo.hasNextPage ? data.orders.pageInfo.endCursor : null;
  } while (after);

  if (!shop) throw new Error("Shopify did not return shop metadata");

  const included = orders.filter((order) => {
    const amount = Number(order.currentTotalPriceSet.shopMoney.amount);
    return !order.cancelledAt && !order.test && Number.isFinite(amount) && amount > 0;
  });
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
    hasReadAllOrders: scopes.includes("read_all_orders"),
    revenue: roundMoney(revenue),
    orderCount,
    aov: orderCount ? roundMoney(revenue / orderCount) : 0,
    daily: Array.from(dailyMap.values()).sort((a, b) => a.date.localeCompare(b.date)),
    orders: included.map((order) => {
      const lastVisit = order.customerJourneySummary?.lastVisit ?? null;
      return {
      id: order.id,
      name: order.name,
      createdAt: order.createdAt,
      itemQuantity: order.lineItems.nodes.reduce((sum, item) => sum + item.quantity, 0),
      subtotal: roundMoney(Number(order.currentSubtotalPriceSet.shopMoney.amount)),
      discounts: roundMoney(Number(order.currentTotalDiscountsSet.shopMoney.amount)),
      total: roundMoney(Number(order.currentTotalPriceSet.shopMoney.amount)),
      financialStatus: order.displayFinancialStatus.toLowerCase(),
      fulfillmentStatus: order.displayFulfillmentStatus.toLowerCase(),
      channel: orderChannel(order),
      customer: order.shippingAddress?.name?.trim() || "Guest / unavailable",
      discountCodes: order.discountCodes,
      discountCode: order.discountCodes.join(", ") || "—",
      attributionSource: order.customerJourneySummary?.lastVisit?.utmParameters?.source
        ?? order.customerJourneySummary?.lastVisit?.sourceDescription
        ?? order.customerJourneySummary?.lastVisit?.source
        ?? "Direct / unavailable",
      attribution: order.customerJourneySummary,
      customerId: numericShopifyId(order.customer?.id),
      customerEmail: order.customer?.email?.trim() || null,
      utmSource: lastVisit?.utmParameters?.source ?? null,
      utmMedium: lastVisit?.utmParameters?.medium ?? null,
      utmCampaign: lastVisit?.utmParameters?.campaign ?? null,
      referringSite: lastVisit?.referrerUrl ?? null,
      landingSite: lastVisit?.landingPage ?? null,
      lineItems: order.lineItems.nodes.map((item) => ({
        productId: numericShopifyId(item.product?.id),
        variantId: numericShopifyId(item.variant?.id),
        productTitle: item.title,
        variantTitle: item.variantTitle,
        quantity: item.quantity,
        price: roundMoney(Number(item.originalUnitPriceSet.shopMoney.amount)),
      })),
      products: order.lineItems.nodes.map((item) => {
        const variant = item.variantTitle && item.variantTitle !== "Default Title" ? ` — ${item.variantTitle}` : "";
        return `${item.title}${variant} × ${item.quantity}`;
      }).join(", "),
      city: order.shippingAddress?.city ?? "—",
      region: order.shippingAddress?.provinceCode ?? "—",
      country: order.shippingAddress?.countryCodeV2 ?? "—",
    };
    }).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
  };
}
