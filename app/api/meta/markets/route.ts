import { NextRequest, NextResponse } from "next/server";
import { getMetaMarketSummary } from "@/lib/meta";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const from = request.nextUrl.searchParams.get("from") ?? "";
    const to = request.nextUrl.searchParams.get("to") ?? "";
    const dimensionParam = request.nextUrl.searchParams.get("dimension") ?? "comscore";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || from > to) {
      return NextResponse.json({ error: "Invalid date range" }, { status: 400 });
    }
    if (dimensionParam !== "comscore" && dimensionParam !== "state") {
      return NextResponse.json({ error: "Dimension must be comscore or state" }, { status: 400 });
    }
    return NextResponse.json(await getMetaMarketSummary(from, to, dimensionParam), {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Unknown Meta error";
    console.error("Meta market request failed:", detail);
    return NextResponse.json({ error: "Unable to load Meta markets", detail }, { status: 502 });
  }
}
