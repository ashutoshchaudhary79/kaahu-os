import { NextRequest, NextResponse } from "next/server";
import { getShopifySummaryFromDb } from "@/lib/dashboard-data";

export const dynamic = "force-dynamic";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function defaultRange() {
  const to = new Date();
  const from = new Date(to);
  from.setUTCDate(from.getUTCDate() - 29);
  return {
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10),
  };
}

function parseRange(request: NextRequest) {
  const defaults = defaultRange();
  const from = request.nextUrl.searchParams.get("from") ?? defaults.from;
  const to = request.nextUrl.searchParams.get("to") ?? defaults.to;

  if (!DATE_PATTERN.test(from) || !DATE_PATTERN.test(to)) {
    throw new Error("Dates must use YYYY-MM-DD format");
  }

  const fromTime = Date.parse(`${from}T00:00:00Z`);
  const toTime = Date.parse(`${to}T00:00:00Z`);
  if (!Number.isFinite(fromTime) || !Number.isFinite(toTime) || fromTime > toTime) {
    throw new Error("The date range is invalid");
  }
  if ((toTime - fromTime) / 86_400_000 > 366) {
    throw new Error("Date ranges cannot exceed 366 days");
  }
  return { from, to };
}

export async function GET(request: NextRequest) {
  try {
    const { from, to } = parseRange(request);
    const data = await getShopifySummaryFromDb(from, to);
    return NextResponse.json(data, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown Shopify error";
    const badRequest = message.includes("date") || message.includes("Dates") || message.includes("366");
    console.error("Shopify dashboard request failed:", message);
    return NextResponse.json(
      { error: "Unable to load Shopify data", detail: message },
      { status: badRequest ? 400 : 502 },
    );
  }
}
