import { NextRequest, NextResponse } from "next/server";
import { getMetaAdSettings } from "@/lib/meta";
import { queryDatabase } from "@/lib/db";
import type { AdSettings } from "@/lib/meta-ad-settings";

export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) {
  const adId = request.nextUrl.searchParams.get("adId") ?? "";
  if (!/^\d{1,30}$/.test(adId)) return NextResponse.json({ error: "A valid ad ID is required" }, { status: 400 });
  const value = process.env.META_AD_ACCOUNT_ID?.trim() ?? "";
  const accountId = value.startsWith("act_") ? value : `act_${value}`;
  const headers = { "Cache-Control": "private, no-store" };
  let cached: AdSettings | undefined;
  try {
    const result = await queryDatabase<{ settings: AdSettings }>(
      "select settings from meta_ad_settings_snapshots where account_id=$1 and ad_id=$2 order by retrieved_at desc limit 1", [accountId, adId]);
    cached = result.rows[0]?.settings;
    if (cached && cached.warnings.length === 0 && Date.now() - Date.parse(cached.retrievedAt) < 3_600_000) return NextResponse.json({ settings: cached, stored: true }, { headers });
  } catch { /* Live reads still work if the migration has not been applied. */ }
  try {
    const settings = await getMetaAdSettings(adId);
    try {
      await queryDatabase("insert into meta_ad_settings_snapshots(account_id,ad_id,retrieved_at,settings) values($1,$2,$3,$4::jsonb) on conflict do nothing",
        [accountId, adId, settings.retrievedAt, JSON.stringify(settings)]);
    } catch { settings.warnings.push("Settings could not be saved to the reporting database."); }
    return NextResponse.json({ settings, stored: false }, { headers });
  } catch {
    if (cached) return NextResponse.json({ settings: cached, stored: true, warning: "Meta refresh failed. Showing the last stored settings." }, { headers });
    return NextResponse.json({ error: "Ad settings could not be retrieved. Check Meta access and whether this ad is available in the connected account." }, { status: 502, headers });
  }
}
