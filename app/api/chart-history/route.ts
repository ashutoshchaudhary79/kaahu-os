import { NextRequest, NextResponse } from "next/server";
import { getChartDailyFromDb } from "@/lib/dashboard-data";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const from = request.nextUrl.searchParams.get("from") ?? "";
  const to = request.nextUrl.searchParams.get("to") ?? "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || from > to) {
    return NextResponse.json({ error: "A valid date range is required" }, { status: 400 });
  }
  try {
    return NextResponse.json(await getChartDailyFromDb(from, to), { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Unknown chart history error";
    console.error("Chart history request failed:", detail);
    return NextResponse.json({ error: "Unable to load chart history", detail }, { status: 502 });
  }
}
