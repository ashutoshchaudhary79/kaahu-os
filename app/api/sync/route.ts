import { NextResponse } from "next/server";
import { syncDashboardSources } from "@/lib/startup-sync";
import { getSourceRefreshStatuses } from "@/lib/dashboard-data";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST() {
  try {
    const outcomes = await syncDashboardSources();
    const failed = outcomes.filter((outcome) => outcome.status !== "success");
    const refreshStatuses = await getSourceRefreshStatuses();
    return NextResponse.json({ ok: failed.length === 0, outcomes, refreshStatuses }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Dashboard sync failed";
    console.error("Dashboard startup sync failed:", detail);
    let refreshStatuses: Awaited<ReturnType<typeof getSourceRefreshStatuses>> = [];
    try { refreshStatuses = await getSourceRefreshStatuses(); }
    catch (statusError) { console.error("Source refresh status lookup failed:", statusError instanceof Error ? statusError.message : "Unknown error"); }
    return NextResponse.json({ ok: false, detail, refreshStatuses }, { status: 502 });
  }
}
