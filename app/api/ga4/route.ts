import { NextRequest, NextResponse } from "next/server";
import { getGa4Summary } from "@/lib/ga4";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const from = request.nextUrl.searchParams.get("from") ?? "";
  const to = request.nextUrl.searchParams.get("to") ?? "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || from > to) return NextResponse.json({ error: "A valid date range is required" }, { status: 400 });
  try { return NextResponse.json(await getGa4Summary(from, to)); }
  catch (error) { const detail = error instanceof Error ? error.message : "Unknown GA4 error"; console.error("GA4 request failed:", detail); return NextResponse.json({ error: "Unable to load GA4 data", detail }, { status: 502 }); }
}
