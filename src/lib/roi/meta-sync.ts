import {
  type LocationRow,
  resolveLocationAccessToken,
} from "@/lib/auth/request";
import {
  fetchFacebookDailyReporting,
  listFacebookCampaigns,
} from "@/lib/ghl/facebook";
import { GhlApiError } from "@/lib/ghl/http";
import {
  addDays,
  expectedDays,
  leadsFromResults,
  leadsFromTotals,
  parseDate,
  safeDiv,
  todayIso,
  toDecimal,
  toInt,
} from "@/lib/roi/numbers";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const DEFAULT_LOOKBACK_DAYS = 90;
export const RECENT_REFRESH_DAYS = 14;
export const ONBOARD_LOOKBACK_DAYS = 365;
export const SYNC_CHUNK_DAYS = 90;
export const ENSURE_MAX_AGE_SECONDS = 5 * 60;

export class IntegrationError extends Error {
  code: string;

  constructor(message: string, code: string) {
    super(message);
    this.code = code;
  }
}

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
  }
}

type SyncStateRow = {
  status: string;
  last_synced_at: string | null;
  daily_from: string | null;
  daily_to: string | null;
  last_error: string;
};

async function getOrCreateSyncState(locationId: string): Promise<void> {
  const db = supabaseAdmin();
  await db.from("meta_sync_states").upsert(
    { location_id: locationId, status: "idle", last_error: "" },
    { onConflict: "location_id", ignoreDuplicates: true },
  );
}

async function setSyncState(
  locationId: string,
  patch: Record<string, unknown>,
): Promise<void> {
  const db = supabaseAdmin();
  await getOrCreateSyncState(locationId);
  const { error } = await db
    .from("meta_sync_states")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("location_id", locationId);
  if (error) throw error;
}

async function upsertPeriodSnapshot(
  locationId: string,
  start: string,
  end: string,
  totals: unknown,
  syncedAt: string,
): Promise<void> {
  if (!totals || typeof totals !== "object") return;
  const t = totals as Record<string, unknown>;

  const impressions = toInt(t.impressions);
  const clicks = toInt(t.clicks);
  const spend = toDecimal(t.spend) ?? 0;
  const conversions = toInt(t.conversions);
  const leads = leadsFromTotals(t);

  const cpc =
    clicks > 0 ? safeDiv(spend, clicks) : toDecimal(t.cpc);
  const cpm =
    impressions > 0
      ? safeDiv(spend * 1000, impressions)
      : toDecimal(t.cpm);
  const ctr =
    impressions > 0
      ? safeDiv(clicks * 100, impressions)
      : toDecimal(t.ctr);
  const cpl = conversions > 0 ? safeDiv(spend, conversions) : null;
  const costPerConversion =
    toDecimal(t.costPerConversion ?? t.cost_per_conversion) ?? cpl;

  const db = supabaseAdmin();
  await db.from("meta_period_snapshots").upsert(
    {
      location_id: locationId,
      period_start: start,
      period_end: end,
      impressions,
      clicks,
      spend,
      conversions,
      leads,
      cpc,
      cpm,
      ctr,
      cost_per_conversion: costPerConversion,
      raw_totals: t,
      synced_at: syncedAt,
    },
    { onConflict: "location_id,period_start,period_end" },
  );
}

function toNumber(value: unknown): number {
  return toDecimal(value) ?? 0;
}

function metaRates(
  spend: number,
  impressions: number,
  clicks: number,
  conversions: number,
  leads: number,
) {
  return {
    ctr: impressions ? safeDiv(clicks * 100, impressions) ?? 0 : 0,
    cpc: safeDiv(spend, clicks) ?? 0,
    cpm: impressions ? safeDiv(spend * 1000, impressions) ?? 0 : 0,
    cost_per_lead: safeDiv(spend, leads) ?? 0,
    cost_per_conversion: safeDiv(spend, conversions) ?? 0,
  };
}

export async function syncLocationMetaAds(
  location: LocationRow,
  start?: string,
  end?: string,
  lookbackDays: number = DEFAULT_LOOKBACK_DAYS,
): Promise<Record<string, unknown>> {
  const endDate = end || todayIso();
  const startDate =
    start || addDays(endDate, -(Math.max(lookbackDays - 1, 0)));
  if (startDate > endDate) {
    throw new ValidationError("start_date must be on or before end_date.");
  }

  await setSyncState(location.id, { status: "syncing", last_error: "" });

  const token = resolveLocationAccessToken(location);
  if (!token) {
    const msg = "No GHL access token for this location.";
    await setSyncState(location.id, { status: "error", last_error: msg });
    throw new IntegrationError(msg, "missing_ghl_token");
  }

  const ghlLocationId = location.ghl_location_id;
  const now = new Date().toISOString();

  let reporting: unknown;
  let campaignsPayload: Record<string, unknown>[];
  try {
    reporting = await fetchFacebookDailyReporting(
      token,
      ghlLocationId,
      startDate,
      endDate,
    );
    campaignsPayload = await listFacebookCampaigns(
      token,
      ghlLocationId,
      startDate,
      endDate,
    );
  } catch (err) {
    const msg =
      err instanceof GhlApiError
        ? err.message
        : err instanceof Error
          ? err.message
          : "Meta ads sync failed.";
    await setSyncState(location.id, { status: "error", last_error: msg });
    throw err;
  }

  const grouped =
    reporting &&
    typeof reporting === "object" &&
    Array.isArray((reporting as Record<string, unknown>).grouped)
      ? ((reporting as Record<string, unknown>).grouped as unknown[])
      : [];

  const db = supabaseAdmin();
  let daysUpserted = 0;

  for (const item of grouped) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const day = parseDate(row.dateStart ?? row.dateStop);
    if (!day) continue;

    const results =
      row.results && typeof row.results === "object"
        ? (row.results as Record<string, unknown>)
        : {};
    const costPerResult =
      row.costPerResultBreakdown && typeof row.costPerResultBreakdown === "object"
        ? row.costPerResultBreakdown
        : {};

    await db.from("meta_ad_daily_stats").upsert(
      {
        location_id: location.id,
        date: day,
        ad_account_id: String(row.accountId || "").slice(0, 64),
        impressions: toInt(row.impressions),
        clicks: toInt(row.clicks),
        spend: toDecimal(row.spend) ?? 0,
        conversions: toInt(row.conversions),
        leads: leadsFromResults(results),
        cpc: toDecimal(row.cpc),
        cpm: toDecimal(row.cpm),
        ctr: toDecimal(row.ctr),
        reach: toInt(row.reach) || null,
        frequency: toDecimal(row.frequency),
        cost_per_conversion: toDecimal(
          row.costPerConversion ?? row.cost_per_conversion,
        ),
        results,
        cost_per_result_breakdown: costPerResult,
        raw: row,
        synced_at: now,
      },
      { onConflict: "location_id,date" },
    );
    daysUpserted += 1;
  }

  if (reporting && typeof reporting === "object") {
    await upsertPeriodSnapshot(
      location.id,
      startDate,
      endDate,
      (reporting as Record<string, unknown>).totals,
      now,
    );
  }

  let campaignsUpserted = 0;
  for (const item of campaignsPayload) {
    const campaignId = String(item.campaignId || "").trim();
    if (!campaignId) continue;
    await db.from("meta_campaigns").upsert(
      {
        location_id: location.id,
        campaign_id: campaignId.slice(0, 64),
        ad_account_id: String(item.adAccountId || "").slice(0, 64),
        name: String(item.name || "").slice(0, 512),
        status: String(item.status || "").slice(0, 64),
        synced_at: now,
      },
      { onConflict: "location_id,campaign_id" },
    );
    campaignsUpserted += 1;
  }

  await setSyncState(location.id, {
    status: "success",
    last_synced_at: now,
    daily_from: startDate,
    daily_to: endDate,
    days_upserted: daysUpserted,
    campaigns_upserted: campaignsUpserted,
    last_error: "",
  });

  const result = {
    location_id: ghlLocationId,
    daily_from: startDate,
    daily_to: endDate,
    days_upserted: daysUpserted,
    campaigns_upserted: campaignsUpserted,
    synced_at: now,
  };
  console.info("meta ads sync ok", result);
  return result;
}

export async function syncLocationMetaAdsLookback(
  location: LocationRow,
  lookbackDays: number = ONBOARD_LOOKBACK_DAYS,
  chunkDays: number = SYNC_CHUNK_DAYS,
): Promise<Record<string, unknown>> {
  const end = todayIso();
  const start = addDays(end, -(Math.max(lookbackDays - 1, 0)));
  let cursor = start;
  let daysUpserted = 0;
  let campaignsUpserted = 0;
  let chunks = 0;

  while (cursor <= end) {
    const chunkEnd = addDays(cursor, Math.max(chunkDays - 1, 0));
    const cappedEnd = chunkEnd > end ? end : chunkEnd;
    const result = await syncLocationMetaAds(location, cursor, cappedEnd);
    daysUpserted += toInt(result.days_upserted);
    campaignsUpserted = Math.max(
      campaignsUpserted,
      toInt(result.campaigns_upserted),
    );
    chunks += 1;
    cursor = addDays(cappedEnd, 1);
  }

  const out = {
    location_id: location.ghl_location_id,
    daily_from: start,
    daily_to: end,
    lookback_days: lookbackDays,
    chunks,
    days_upserted: daysUpserted,
    campaigns_upserted: campaignsUpserted,
  };
  console.info("meta ads lookback sync ok", out);
  return out;
}

export async function summarizeMetaAds(
  location: LocationRow,
  startDate: string,
  endDate: string,
): Promise<Record<string, unknown>> {
  const db = supabaseAdmin();
  const { data: rows } = await db
    .from("meta_ad_daily_stats")
    .select(
      "date, impressions, clicks, spend, conversions, leads, cpc, cpm, ctr",
    )
    .eq("location_id", location.id)
    .gte("date", startDate)
    .lte("date", endDate)
    .order("date", { ascending: true });

  const daily = rows || [];
  let dayImpressions = 0;
  let dayClicks = 0;
  let daySpend = 0;
  let dayConversions = 0;
  let dayLeads = 0;
  let lastDay: string | null = null;

  for (const row of daily) {
    dayImpressions += toInt(row.impressions);
    dayClicks += toInt(row.clicks);
    daySpend += toDecimal(row.spend) ?? 0;
    dayConversions += toInt(row.conversions);
    dayLeads += toInt(row.leads);
    lastDay = row.date;
  }

  const dayCount = daily.length;
  const expected = expectedDays(startDate, endDate);

  const { data: snapshot } = await db
    .from("meta_period_snapshots")
    .select("*")
    .eq("location_id", location.id)
    .eq("period_start", startDate)
    .eq("period_end", endDate)
    .maybeSingle();

  const seriesTotals = {
    impressions: dayImpressions,
    clicks: dayClicks,
    spend: daySpend,
    conversions: dayConversions,
    leads: dayLeads,
    ...metaRates(daySpend, dayImpressions, dayClicks, dayConversions, dayLeads),
  };

  let ghlTotals: Record<string, unknown> | null = null;
  let snapshotSyncedAt: string | null = null;

  if (snapshot) {
    const snapSpend = toDecimal(snapshot.spend) ?? 0;
    const snapRates = metaRates(
      snapSpend,
      toInt(snapshot.impressions),
      toInt(snapshot.clicks),
      toInt(snapshot.conversions),
      toInt(snapshot.leads),
    );
    ghlTotals = {
      impressions: toInt(snapshot.impressions),
      clicks: toInt(snapshot.clicks),
      spend: snapSpend,
      conversions: toInt(snapshot.conversions),
      leads: toInt(snapshot.leads),
      ctr: snapshot.ctr != null ? toNumber(snapshot.ctr) : snapRates.ctr,
      cpc: snapshot.cpc != null ? toNumber(snapshot.cpc) : snapRates.cpc,
      cpm: snapshot.cpm != null ? toNumber(snapshot.cpm) : snapRates.cpm,
      cost_per_lead: snapRates.cost_per_lead,
      cost_per_conversion:
        snapshot.cost_per_conversion != null
          ? toNumber(snapshot.cost_per_conversion)
          : snapRates.cost_per_conversion,
    };
    snapshotSyncedAt = snapshot.synced_at;
  }

  let totals: Record<string, unknown>;
  let source: string;
  if (dayCount > 0) {
    totals = seriesTotals;
    source = "daily_sum";
  } else if (ghlTotals) {
    totals = ghlTotals;
    source = "ghl_totals";
  } else {
    totals = seriesTotals;
    source = "daily_sum";
  }

  let totalsAligned = true;
  if (ghlTotals && dayCount > 0) {
    totalsAligned =
      Math.abs(toNumber(ghlTotals.spend) - seriesTotals.spend) < 0.05;
  }

  const { data: state } = await db
    .from("meta_sync_states")
    .select("status, last_synced_at, daily_from, daily_to, last_error")
    .eq("location_id", location.id)
    .maybeSingle();

  const syncState = (state || null) as SyncStateRow | null;

  return {
    start_date: startDate,
    end_date: endDate,
    days_with_data: dayCount,
    expected_days: expected,
    data_through: lastDay,
    totals_source: source,
    totals_aligned: totalsAligned,
    totals,
    series_totals: seriesTotals,
    ghl_totals: ghlTotals,
    sync: {
      status: syncState?.status ?? "never",
      last_synced_at:
        snapshotSyncedAt ?? syncState?.last_synced_at ?? null,
      daily_from: syncState?.daily_from ?? null,
      daily_to: syncState?.daily_to ?? null,
      last_error: syncState?.last_error ?? "",
      range_synced_at: snapshotSyncedAt,
    },
  };
}

export async function listDailySeries(
  location: LocationRow,
  startDate: string,
  endDate: string,
): Promise<Record<string, unknown>[]> {
  const db = supabaseAdmin();
  const { data: rows } = await db
    .from("meta_ad_daily_stats")
    .select(
      "date, impressions, clicks, spend, conversions, leads, cpc, cpm, ctr, reach",
    )
    .eq("location_id", location.id)
    .gte("date", startDate)
    .lte("date", endDate)
    .order("date", { ascending: true });

  return (rows || []).map((row) => ({
    date: row.date,
    impressions: toInt(row.impressions),
    clicks: toInt(row.clicks),
    spend: toDecimal(row.spend) ?? 0,
    conversions: toInt(row.conversions),
    leads: toInt(row.leads),
    cpc: row.cpc != null ? toNumber(row.cpc) : null,
    cpm: row.cpm != null ? toNumber(row.cpm) : null,
    ctr: row.ctr != null ? toNumber(row.ctr) : null,
    reach: row.reach,
  }));
}

function campaignStatusRank(status: string): number {
  const s = status.toUpperCase();
  if (s === "ACTIVE") return 0;
  if (s === "PAUSED") return 1;
  return 2;
}

export async function listCampaigns(
  location: LocationRow,
): Promise<Record<string, unknown>[]> {
  const db = supabaseAdmin();
  const { data: rows } = await db
    .from("meta_campaigns")
    .select("campaign_id, ad_account_id, name, status, synced_at")
    .eq("location_id", location.id);

  return (rows || [])
    .slice()
    .sort((a, b) => {
      const rank =
        campaignStatusRank(String(a.status)) -
        campaignStatusRank(String(b.status));
      if (rank !== 0) return rank;
      return String(a.name).localeCompare(String(b.name));
    })
    .map((row) => ({
      campaign_id: row.campaign_id,
      ad_account_id: row.ad_account_id,
      name: row.name,
      status: row.status,
      synced_at: row.synced_at,
    }));
}

export async function refreshAllLocationsMetaAds(): Promise<Record<string, number>> {
  const end = todayIso();
  const recentStart = addDays(end, -(RECENT_REFRESH_DAYS - 1));
  const db = supabaseAdmin();

  const { data: locations } = await db
    .from("locations")
    .select(
      "id, agency_id, ghl_location_id, name, is_active, access_token_enc, refresh_token_enc, token_expires_at, scope, agency:agencies(id, access_token_enc, refresh_token_enc)",
    )
    .eq("is_active", true);

  let ok = 0;
  let err = 0;
  let skipped = 0;

  for (const loc of locations || []) {
    const location = loc as unknown as LocationRow;
    if (!resolveLocationAccessToken(location)) {
      skipped += 1;
      continue;
    }

    const { count } = await db
      .from("meta_ad_daily_stats")
      .select("id", { count: "exact", head: true })
      .eq("location_id", location.id);

    const windowStart =
      (count || 0) > 0
        ? recentStart
        : addDays(end, -(DEFAULT_LOOKBACK_DAYS - 1));

    try {
      await syncLocationMetaAds(location, windowStart, end);
      ok += 1;
    } catch (e) {
      err += 1;
      console.error("refreshAllLocationsMetaAds failed", location.ghl_location_id, e);
    }
  }

  const result = { success: ok, errors: err, skipped };
  console.info("refreshAllLocationsMetaAds done", result);
  return result;
}
