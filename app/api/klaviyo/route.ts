import { NextRequest, NextResponse } from "next/server";
import { getKlaviyoSummaryFromDb } from "@/lib/dashboard-data";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const from = request.nextUrl.searchParams.get("from") ?? ""; const to = request.nextUrl.searchParams.get("to") ?? "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || from > to) return NextResponse.json({ error: "A valid date range is required" }, { status: 400 });
  try { return NextResponse.json(await getKlaviyoSummaryFromDb(from, to)); }
  catch (error) { const detail = error instanceof Error ? error.message : "Unknown Klaviyo error"; console.error("Klaviyo request failed:", detail); return NextResponse.json({ error: "Unable to load Klaviyo data", detail }, { status: 502 }); }
}
