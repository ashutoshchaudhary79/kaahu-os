import { NextResponse } from "next/server";
import { syncDashboardSources } from "@/lib/startup-sync";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST() {
  try {
    const outcomes = await syncDashboardSources();
    const failed = outcomes.filter((outcome) => outcome.status !== "success");
    return NextResponse.json({ ok: failed.length === 0, outcomes }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Dashboard sync failed";
    console.error("Dashboard startup sync failed:", detail);
    return NextResponse.json({ ok: false, detail }, { status: 502 });
  }
}
