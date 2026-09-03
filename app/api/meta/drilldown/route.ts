import { NextRequest, NextResponse } from "next/server";
import { getMetaBreakdownFromDb } from "@/lib/dashboard-data";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const from = request.nextUrl.searchParams.get("from") ?? "";
    const to = request.nextUrl.searchParams.get("to") ?? "";
    const level = request.nextUrl.searchParams.get("level");
    const parentId = request.nextUrl.searchParams.get("parentId") ?? "";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || from > to) {
      return NextResponse.json({ error: "Invalid date range" }, { status: 400 });
    }
    if (level !== "adset" && level !== "ad") {
      return NextResponse.json({ error: "Level must be adset or ad" }, { status: 400 });
    }
    if (!/^\d+$/.test(parentId)) {
      return NextResponse.json({ error: "A valid parentId is required" }, { status: 400 });
    }
    const rows = await getMetaBreakdownFromDb(from, to, level, parentId);
    return NextResponse.json({ level, parentId, rows }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Unknown Meta error";
    console.error("Meta drill-down request failed:", detail);
    return NextResponse.json({ error: "Unable to load Meta drill-down", detail }, { status: 502 });
  }
}
