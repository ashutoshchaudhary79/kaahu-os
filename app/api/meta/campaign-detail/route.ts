import { NextRequest, NextResponse } from "next/server";
import { getMetaCampaignDetail } from "@/lib/meta";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const campaignId = request.nextUrl.searchParams.get("campaignId") ?? "";
    const to = request.nextUrl.searchParams.get("to") ?? "";
    if (!/^\d+$/.test(campaignId)) return NextResponse.json({ error: "A valid campaignId is required" }, { status: 400 });
    if (!/^\d{4}-\d{2}-\d{2}$/.test(to) || !Number.isFinite(Date.parse(`${to}T00:00:00Z`))) {
      return NextResponse.json({ error: "A valid end date is required" }, { status: 400 });
    }
    const fromDate = new Date(`${to}T12:00:00Z`);
    fromDate.setUTCDate(fromDate.getUTCDate() - 29);
    const data = await getMetaCampaignDetail(campaignId, fromDate.toISOString().slice(0, 10), to);
    return NextResponse.json(data, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Unknown Meta error";
    console.error("Meta campaign detail request failed:", detail);
    return NextResponse.json({ error: "Unable to load campaign detail", detail }, { status: 502 });
  }
}
