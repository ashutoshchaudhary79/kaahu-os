import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { loadEnvConfig } from "@next/env";
import { parse } from "csv-parse/sync";
import type { PoolClient } from "pg";
import { getDatabasePool } from "../lib/db";
import { normalizeShopifySalesChannel } from "../lib/shopify";

type CsvRow = Record<string, string>;

type ImportedLineItem = {
  productTitle: string | null;
  quantity: number;
  price: number;
};

type ImportedOrder = {
  orderId: string;
  orderNumber: string;
  placedAt: string;
  financialStatus: string | null;
  fulfillmentStatus: string | null;
  rawTotal: number;
  refundedAmount: number;
  total: number;
  subtotal: number | null;
  discounts: number | null;
  currency: string;
  destinationCity: string | null;
  destinationState: string | null;
  destinationCountry: string | null;
  salesChannel: string;
  itemCount: number;
  customerHash: string | null;
  cancelled: boolean;
  lineItems: ImportedLineItem[];
};

type ImportSummary = {
  parsedRows: number;
  parsedOrders: number;
  importedOrders: number;
  importedLineItems: number;
  skippedCancelled: number;
  skippedNonPositiveTotal: number;
};

const REQUIRED_COLUMNS = [
  "Name", "Email", "Financial Status", "Fulfillment Status", "Currency",
  "Subtotal", "Total", "Discount Amount", "Created at", "Lineitem quantity",
  "Lineitem name", "Lineitem price", "Billing City", "Billing Province",
  "Billing Country", "Shipping City", "Shipping Province", "Shipping Country",
  "Cancelled at", "Refunded Amount", "Id", "Source",
];

function textOrNull(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function parseMoney(value: string | undefined, field: string, orderName: string): number {
  const normalized = value?.trim().replace(/,/g, "") || "0";
  const amount = Number(normalized);
  if (!Number.isFinite(amount)) throw new Error(`Invalid ${field} for order ${orderName}`);
  return Math.round((amount + Number.EPSILON) * 100) / 100;
}

function parseOptionalMoney(value: string | undefined, field: string, orderName: string): number | null {
  return value?.trim() ? parseMoney(value, field, orderName) : null;
}

function parseQuantity(value: string | undefined, orderName: string): number {
  const quantity = Number(value);
  if (!Number.isInteger(quantity) || quantity < 0) {
    throw new Error(`Invalid line-item quantity for order ${orderName}`);
  }
  return quantity;
}

function hashEmail(value: string | undefined): string | null {
  const normalized = value?.trim().toLowerCase();
  return normalized ? createHash("sha256").update(normalized).digest("hex") : null;
}

function firstValue(rows: CsvRow[], column: string): string {
  return rows.find((row) => row[column]?.trim())?.[column]?.trim() ?? "";
}

function validateColumns(rows: CsvRow[]): void {
  if (!rows.length) throw new Error("CSV contains no data rows");
  const present = new Set(Object.keys(rows[0]));
  const missing = REQUIRED_COLUMNS.filter((column) => !present.has(column));
  if (missing.length) throw new Error(`CSV is missing required columns: ${missing.join(", ")}`);
}

function buildOrders(rows: CsvRow[]): ImportedOrder[] {
  const groups = new Map<string, CsvRow[]>();
  for (const row of rows) {
    const name = row.Name?.trim();
    if (!name) throw new Error("CSV row has no Name and cannot be grouped safely");
    const group = groups.get(name) ?? [];
    group.push(row);
    groups.set(name, group);
  }

  return Array.from(groups, ([orderNumber, group]) => {
    const orderId = firstValue(group, "Id");
    const placedAt = firstValue(group, "Created at");
    if (!/^\d+$/.test(orderId)) throw new Error(`Order ${orderNumber} has no valid numeric Id`);
    if (!placedAt || Number.isNaN(Date.parse(placedAt))) throw new Error(`Order ${orderNumber} has an invalid Created at value`);

    const rawTotal = parseMoney(firstValue(group, "Total"), "Total", orderNumber);
    const refundedAmount = parseMoney(firstValue(group, "Refunded Amount"), "Refunded Amount", orderNumber);
    const total = Math.round((rawTotal - refundedAmount + Number.EPSILON) * 100) / 100;
    const currency = firstValue(group, "Currency");
    if (!currency) throw new Error(`Order ${orderNumber} has no Currency`);
    const email = firstValue(group, "Email");
    const source = firstValue(group, "Source");
    const lineItems = group.map((row) => ({
      productTitle: textOrNull(row["Lineitem name"]),
      quantity: parseQuantity(row["Lineitem quantity"], orderNumber),
      price: parseMoney(row["Lineitem price"], "Lineitem price", orderNumber),
    }));

    return {
      orderId,
      orderNumber,
      placedAt,
      financialStatus: textOrNull(firstValue(group, "Financial Status")?.toLowerCase()),
      fulfillmentStatus: textOrNull(firstValue(group, "Fulfillment Status")?.toLowerCase()),
      rawTotal,
      refundedAmount,
      total,
      subtotal: parseOptionalMoney(firstValue(group, "Subtotal"), "Subtotal", orderNumber),
      discounts: parseOptionalMoney(firstValue(group, "Discount Amount"), "Discount Amount", orderNumber),
      currency,
      destinationCity: textOrNull(firstValue(group, "Shipping City") || firstValue(group, "Billing City")),
      destinationState: textOrNull(firstValue(group, "Shipping Province") || firstValue(group, "Billing Province")),
      destinationCountry: textOrNull(firstValue(group, "Shipping Country") || firstValue(group, "Billing Country")),
      salesChannel: normalizeShopifySalesChannel(source),
      itemCount: lineItems.reduce((sum, item) => sum + item.quantity, 0),
      customerHash: hashEmail(email),
      cancelled: Boolean(firstValue(group, "Cancelled at")),
      lineItems,
    };
  });
}

async function upsertOrder(client: PoolClient, order: ImportedOrder): Promise<number> {
  await client.query(
    `insert into shopify_orders (
       order_id, order_number, customer_hash, placed_at, financial_status,
       fulfillment_status, subtotal, discounts, total, currency,
       destination_city, destination_state, destination_country, sales_channel,
       item_count, synced_at
     ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,now())
     on conflict (order_id) do update set
       order_number = excluded.order_number,
       customer_hash = coalesce(shopify_orders.customer_hash, excluded.customer_hash),
       placed_at = excluded.placed_at,
       financial_status = excluded.financial_status,
       fulfillment_status = excluded.fulfillment_status,
       subtotal = excluded.subtotal,
       discounts = excluded.discounts,
       total = excluded.total,
       currency = excluded.currency,
       destination_city = coalesce(shopify_orders.destination_city, excluded.destination_city),
       destination_state = coalesce(shopify_orders.destination_state, excluded.destination_state),
       destination_country = coalesce(shopify_orders.destination_country, excluded.destination_country),
       sales_channel = coalesce(shopify_orders.sales_channel, excluded.sales_channel),
       item_count = excluded.item_count,
       synced_at = now()`,
    [order.orderId, order.orderNumber, order.customerHash, order.placedAt,
      order.financialStatus, order.fulfillmentStatus, order.subtotal, order.discounts,
      order.total, order.currency, order.destinationCity, order.destinationState,
      order.destinationCountry, order.salesChannel, order.itemCount],
  );

  const existing = await client.query<{ count: string; has_richer: boolean }>(
    `select count(*)::text as count,
            coalesce(bool_or(product_id is not null or variant_id is not null), false) as has_richer
       from shopify_order_line_items where order_id = $1`,
    [order.orderId],
  );
  const count = Number(existing.rows[0].count);
  if (count && existing.rows[0].has_richer) return 0;
  if (count) await client.query("delete from shopify_order_line_items where order_id = $1", [order.orderId]);

  for (const item of order.lineItems) {
    await client.query(
      `insert into shopify_order_line_items
         (order_id, product_id, variant_id, product_title, variant_title, quantity, price)
       values ($1, null, null, $2, null, $3, $4)`,
      [order.orderId, item.productTitle, item.quantity, item.price],
    );
  }
  return order.lineItems.length;
}

function printSummary(summary: ImportSummary, dryRun: boolean): void {
  console.log(`CSV rows parsed: ${summary.parsedRows}`);
  console.log(`Orders parsed: ${summary.parsedOrders}`);
  console.log(`${dryRun ? "Orders eligible" : "Orders imported"}: ${summary.importedOrders}`);
  console.log(`Orders skipped (cancelled): ${summary.skippedCancelled}`);
  console.log(`Orders skipped (zero/non-positive current total): ${summary.skippedNonPositiveTotal}`);
  console.log(`${dryRun ? "Line items eligible" : "Line items imported"}: ${summary.importedLineItems}`);
  console.log("Caveat: test-order exclusion cannot be verified from this CSV; spot-check Shopify Admin if test orders are a concern.");
  console.log("Caveat: historical customer_hash and live customer_id do not reconcile customers across the CSV/API boundary.");
}

async function main(): Promise<void> {
  loadEnvConfig(process.cwd());
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const fileArg = args.find((arg) => !arg.startsWith("--"));
  if (!fileArg) throw new Error("Usage: npm run import:shopify-csv -- <file.csv> [--dry-run]");

  const rows = parse(await readFile(resolve(fileArg)), {
    columns: true,
    bom: true,
    skip_empty_lines: true,
    relax_column_count: false,
    trim: false,
  }) as CsvRow[];
  validateColumns(rows);
  const orders = buildOrders(rows);
  const cancelled = orders.filter((order) => order.cancelled);
  const nonPositive = orders.filter((order) => !order.cancelled && order.total <= 0);
  const eligible = orders.filter((order) => !order.cancelled && order.total > 0);

  for (const order of orders.filter((entry) => entry.rawTotal !== entry.total)) {
    console.log(`Refund adjustment ${order.orderNumber}: raw=${order.rawTotal.toFixed(2)}, refunded=${order.refundedAmount.toFixed(2)}, current=${order.total.toFixed(2)}`);
  }

  let importedLineItems = eligible.reduce((sum, order) => sum + order.lineItems.length, 0);
  if (!dryRun) {
    const client = await getDatabasePool().connect();
    importedLineItems = 0;
    try {
      await client.query("begin");
      for (const order of eligible) importedLineItems += await upsertOrder(client, order);
      await client.query("commit");
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
      await getDatabasePool().end();
    }
  }

  printSummary({
    parsedRows: rows.length,
    parsedOrders: orders.length,
    importedOrders: eligible.length,
    importedLineItems,
    skippedCancelled: cancelled.length,
    skippedNonPositiveTotal: nonPositive.length,
  }, dryRun);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
