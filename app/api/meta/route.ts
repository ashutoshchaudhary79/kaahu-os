import { NextRequest, NextResponse } from "next/server";
import { getMetaSummaryFromDb } from "@/lib/dashboard-data";

export const dynamic = "force-dynamic";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function range(request: NextRequest) {
  const now = new Date();
  const prior = new Date(now);
  prior.setUTCDate(prior.getUTCDate() - 29);
  const from = request.nextUrl.searchParams.get("from") ?? prior.toISOString().slice(0, 10);
  const to = request.nextUrl.searchParams.get("to") ?? now.toISOString().slice(0, 10);
  if (!DATE_PATTERN.test(from) || !DATE_PATTERN.test(to)) throw new Error("Dates must use YYYY-MM-DD format");
  const fromTime = Date.parse(`${from}T00:00:00Z`);
  const toTime = Date.parse(`${to}T00:00:00Z`);
  if (!Number.isFinite(fromTime) || !Number.isFinite(toTime) || fromTime > toTime) throw new Error("The date range is invalid");
  return { from, to };
}

export async function GET(request: NextRequest) {
  try {
    const { from, to } = range(request);
    return NextResponse.json(await getMetaSummaryFromDb(from, to), {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Unknown Meta error";
    const badRequest = detail.includes("date") || detail.includes("Dates");
    console.error("Meta dashboard request failed:", detail);
    return NextResponse.json({ error: "Unable to load Meta data", detail }, { status: badRequest ? 400 : 502 });
  }
}
