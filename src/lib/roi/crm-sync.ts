import { type LocationRow, resolveLocationAccessToken } from "@/lib/auth/request";
import { GhlApiError } from "@/lib/ghl/http";
import {
  ensureLocationAccessToken,
  loadLocationWithAgency,
  type LocationTokenRow,
} from "@/lib/ghl/token-refresh";
import { fetchPipelines, searchOpportunities } from "@/lib/ghl/opportunities";
import { money, parseDt, toDecimal } from "@/lib/roi/numbers";
import { summarizeGoogleAds } from "@/lib/roi/google-sync";
import { ValidationError } from "@/lib/roi/meta-sync";
import { summarizeMetaAds } from "@/lib/roi/meta-sync";
import { supabaseAdmin } from "@/lib/supabase/admin";

export type OpportunityStatus =
  | "open"
  | "won"
  | "lost"
  | "abandoned"
  | "other";

export type SourceChannel = "facebook" | "google" | "other";

export type CrmSetupRow = {
  id: string;
  location_id: string;
  pipeline_id: string;
  pipeline_name: string;
  setup_status: "needs_pipeline" | "confirmed";
  confirmed_at: string | null;
  last_synced_at: string | null;
  opportunities_synced: number;
  last_sync_error: string;
  sync_status: string;
};

export function normalizeOpportunityStatus(raw: unknown): OpportunityStatus {
  const text = String(raw || "")
    .trim()
    .toLowerCase();
  if (text === "open") return "open";
  if (["won", "closed won", "closed_won"].includes(text)) return "won";
  if (["lost", "closed lost", "closed_lost"].includes(text)) return "lost";
  if (["abandoned", "abandon", "abondoned"].includes(text)) return "abandoned";
  if (text.includes("won")) return "won";
  if (text.includes("lost")) return "lost";
  if (text.includes("abandon")) return "abandoned";
  if (text === "open" || text.startsWith("open")) return "open";
  return "other";
}

export function mapSourceChannel(raw: unknown): SourceChannel {
  const text = String(raw || "")
    .trim()
    .toLowerCase();
  if (!text) return "other";
  const compact = text.replace(/[\s_-]/g, "");
  if (text.includes("google")) return "google";
  if (
    text.includes("fb") ||
    text.includes("facebook") ||
    text.includes("meta") ||
    text.includes("paid social") ||
    ["fblead", "fbleads", "paidsocial"].includes(compact)
  ) {
    return "facebook";
  }
  return "other";
}

function extractSource(payload: Record<string, unknown>): string {
  for (const key of ["source", "opportunitySource", "leadSource"]) {
    const val = payload[key];
    if (val) return String(val).trim();
  }

  const custom = payload.customFields ?? payload.customField ?? [];
  if (custom && typeof custom === "object" && !Array.isArray(custom)) {
    for (const [k, v] of Object.entries(custom as Record<string, unknown>)) {
      if (String(k).toLowerCase().includes("source") && v) {
        return String(v).trim();
      }
    }
  }

  if (Array.isArray(custom)) {
    for (const item of custom) {
      if (!item || typeof item !== "object") continue;
      const row = item as Record<string, unknown>;
      const key = String(
        row.key || row.fieldKey || row.name || row.id || "",
      ).toLowerCase();
      if (key.includes("source")) {
        const val = row.field_value ?? row.value ?? row.fieldValue;
        if (val) return String(val).trim();
      }
    }
  }

  return "";
}

export async function getOrCreateCrmSetup(
  locationId: string,
): Promise<CrmSetupRow> {
  const db = supabaseAdmin();
  await db.from("roi_crm_setups").upsert(
    {
      location_id: locationId,
      setup_status: "needs_pipeline",
      sync_status: "idle",
      last_sync_error: "",
    },
    { onConflict: "location_id", ignoreDuplicates: true },
  );

  const { data, error } = await db
    .from("roi_crm_setups")
    .select("*")
    .eq("location_id", locationId)
    .single();
  if (error || !data) throw error || new Error("CRM setup not found");
  return data as CrmSetupRow;
}

async function setCrmSyncState(
  locationId: string,
  patch: Record<string, unknown>,
): Promise<void> {
  await getOrCreateCrmSetup(locationId);
  const db = supabaseAdmin();
  const { error } = await db
    .from("roi_crm_setups")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("location_id", locationId);
  if (error) throw error;
}

export async function serializeCrmSetup(
  setup: CrmSetupRow,
  ghlLocationId: string,
): Promise<Record<string, unknown>> {
  const db = supabaseAdmin();
  const pipelineId = setup.pipeline_id || "";
  let opportunityCount = 0;
  if (pipelineId) {
    const { count } = await db
      .from("ghl_opportunities")
      .select("id", { count: "exact", head: true })
      .eq("location_id", setup.location_id)
      .eq("pipeline_id", pipelineId);
    opportunityCount = count || 0;
  }

  return {
    location_id: ghlLocationId,
    pipeline_id: pipelineId,
    pipeline_name: setup.pipeline_name,
    setup_status: setup.setup_status,
    confirmed_at: setup.confirmed_at,
    last_synced_at: setup.last_synced_at,
    opportunities_synced: setup.opportunities_synced,
    opportunity_count: opportunityCount,
    sync_status: setup.sync_status,
    last_sync_error: setup.last_sync_error,
    is_configured: Boolean(
      pipelineId && setup.setup_status === "confirmed",
    ),
  };
}

export async function discoverPipelines(
  location: LocationRow,
): Promise<Record<string, unknown>> {
  let tokenRow = (await loadLocationWithAgency(location.id)) as LocationTokenRow | null;
  if (!tokenRow) tokenRow = location as LocationTokenRow;

  let token = resolveLocationAccessToken(tokenRow);
  let pipelines;
  try {
    pipelines = token
      ? await fetchPipelines(token, location.ghl_location_id)
      : [];
  } catch (err) {
    if (!(err instanceof GhlApiError)) throw err;
    token = await ensureLocationAccessToken(tokenRow, true);
    pipelines = await fetchPipelines(token, location.ghl_location_id);
  }

  const setup = await getOrCreateCrmSetup(location.id);
  return {
    ...(await serializeCrmSetup(setup, location.ghl_location_id)),
    pipelines,
  };
}

export async function saveCrmPipeline(
  location: LocationRow,
  pipelineId: string,
  pipelineName = "",
): Promise<Record<string, unknown>> {
  const pid = (pipelineId || "").trim();
  if (!pid) throw new ValidationError("Select a pipeline.");

  let name = (pipelineName || "").trim();
  if (!name) {
    try {
      const discovered = await discoverPipelines(location);
      for (const p of (discovered.pipelines as Record<string, unknown>[]) || []) {
        if (p.id === pid) {
          name = String(p.name || "");
          break;
        }
      }
    } catch (err) {
      console.error("pipeline name lookup failed", location.ghl_location_id, err);
    }
  }

  const setup = await getOrCreateCrmSetup(location.id);
  const db = supabaseAdmin();
  const now = new Date().toISOString();
  const { data, error } = await db
    .from("roi_crm_setups")
    .update({
      pipeline_id: pid,
      pipeline_name: name || pid,
      setup_status: "confirmed",
      confirmed_at: now,
      updated_at: now,
    })
    .eq("location_id", location.id)
    .select("*")
    .single();
  if (error || !data) throw error || new Error("Failed to save pipeline");

  return serializeCrmSetup(data as CrmSetupRow, location.ghl_location_id);
}

export async function upsertOpportunity(
  location: LocationRow,
  payload: Record<string, unknown>,
  syncedAt?: string,
): Promise<{ ghl_opportunity_id: string }> {
  const oid = String(payload.id || payload._id || "").trim();
  if (!oid) throw new ValidationError("Opportunity missing id.");

  const statusRaw = String(payload.status || "").trim();
  const sourceRaw = extractSource(payload);
  let stageId = String(payload.pipelineStageId || "").trim();
  let stageName = "";
  const stageObj = payload.pipelineStage;
  if (stageObj && typeof stageObj === "object") {
    const s = stageObj as Record<string, unknown>;
    stageId = String(s.id || stageId).trim();
    stageName = String(s.name || "").trim();
  } else if (stageObj && !stageId) {
    stageId = String(stageObj).trim();
  }

  const contact =
    payload.contact && typeof payload.contact === "object"
      ? (payload.contact as Record<string, unknown>)
      : {};
  const contactId = String(
    payload.contactId || contact.id || contact._id || "",
  ).trim();

  const moneyRaw =
    payload.monetaryValue !== undefined ? payload.monetaryValue : payload.value;
  const now = syncedAt || new Date().toISOString();

  const db = supabaseAdmin();
  await db.from("ghl_opportunities").upsert(
    {
      location_id: location.id,
      ghl_opportunity_id: oid,
      pipeline_id: String(payload.pipelineId || "").trim(),
      pipeline_stage_id: stageId,
      pipeline_stage_name: stageName,
      name: String(payload.name || payload.title || "").slice(0, 512),
      status: normalizeOpportunityStatus(statusRaw),
      status_raw: statusRaw.slice(0, 64),
      monetary_value: money(moneyRaw),
      source_raw: sourceRaw.slice(0, 255),
      source_channel: mapSourceChannel(sourceRaw),
      contact_id: contactId.slice(0, 64),
      ghl_created_at: parseDt(payload.createdAt ?? payload.dateAdded),
      ghl_updated_at: parseDt(payload.updatedAt),
      last_status_change_at: parseDt(
        payload.lastStatusChangeAt ??
          payload.statusUpdatedAt ??
          payload.lastStageChangeAt,
      ),
      raw: payload,
      synced_at: now,
    },
    { onConflict: "location_id,ghl_opportunity_id" },
  );

  return { ghl_opportunity_id: oid };
}

export async function syncLocationOpportunities(
  location: LocationRow,
): Promise<Record<string, unknown>> {
  const setup = await getOrCreateCrmSetup(location.id);
  if (!setup.pipeline_id || setup.setup_status !== "confirmed") {
    throw new ValidationError(
      "Select and confirm a CRM pipeline before syncing opportunities.",
    );
  }

  await setCrmSyncState(location.id, {
    sync_status: "syncing",
    last_sync_error: "",
  });

  try {
    let tokenRow = (await loadLocationWithAgency(location.id)) as LocationTokenRow | null;
    if (!tokenRow) tokenRow = location as LocationTokenRow;

    let token = resolveLocationAccessToken(tokenRow) || "";
    if (!token) {
      token = await ensureLocationAccessToken(tokenRow, true);
    }

    let payloads: Record<string, unknown>[];
    try {
      payloads = await searchOpportunities(
        token,
        location.ghl_location_id,
        setup.pipeline_id,
      );
    } catch (err) {
      const status =
        err instanceof GhlApiError
          ? Number(err.details?.status || 0)
          : 0;
      if (status === 401 || status === 403) {
        token = await ensureLocationAccessToken(tokenRow, true);
        payloads = await searchOpportunities(
          token,
          location.ghl_location_id,
          setup.pipeline_id,
        );
      } else {
        throw err;
      }
    }

    const now = new Date().toISOString();
    const seenIds: string[] = [];

    for (const payload of payloads) {
      const body =
        payload.pipelineId != null && payload.pipelineId !== ""
          ? payload
          : { ...payload, pipelineId: setup.pipeline_id };
      try {
        const row = await upsertOpportunity(location, body, now);
        seenIds.push(row.ghl_opportunity_id);
      } catch (err) {
        if (err instanceof ValidationError) continue;
        throw err;
      }
    }

    const db = supabaseAdmin();
    let deleted = 0;
    const { data: existing } = await db
      .from("ghl_opportunities")
      .select("id, ghl_opportunity_id")
      .eq("location_id", location.id)
      .eq("pipeline_id", setup.pipeline_id);

    const seen = new Set(seenIds);
    const staleIds = (existing || [])
      .filter((row) => !seen.has(row.ghl_opportunity_id))
      .map((row) => row.id);

    if (staleIds.length > 0) {
      const { count } = await db
        .from("ghl_opportunities")
        .delete({ count: "exact" })
        .in("id", staleIds);
      deleted = count || 0;
    }

    await setCrmSyncState(location.id, {
      opportunities_synced: seenIds.length,
      last_synced_at: now,
      sync_status: "success",
      last_sync_error: "",
    });

    const result = {
      location_id: location.ghl_location_id,
      pipeline_id: setup.pipeline_id,
      upserted: seenIds.length,
      deleted_stale: deleted,
      synced_at: now,
    };
    console.info("CRM opportunities sync done", result);
    return result;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await setCrmSyncState(location.id, {
      sync_status: "error",
      last_sync_error: msg.slice(0, 2000),
    });
    throw err;
  }
}

function channelBucket(): Record<string, unknown> {
  return {
    won_revenue: 0,
    won_count: 0,
    open_value: 0,
    open_count: 0,
    lost_value: 0,
    lost_count: 0,
    abandoned_value: 0,
    abandoned_count: 0,
    spend: 0,
    roas: null,
    cost_per_won: null,
  };
}

function dayBounds(start: string, end: string): { start: string; end: string } {
  return {
    start: `${start}T00:00:00.000Z`,
    end: `${end}T23:59:59.999Z`,
  };
}

function inRange(row: Record<string, unknown>, startIso: string, endIso: string) {
  const statusChange = row.last_status_change_at as string | null;
  const created = row.ghl_created_at as string | null;
  const fallbackCreated = row.created_at as string | null;

  if (statusChange) {
    return statusChange >= startIso && statusChange <= endIso;
  }
  if (created) {
    return created >= startIso && created <= endIso;
  }
  if (fallbackCreated) {
    return fallbackCreated >= startIso && fallbackCreated <= endIso;
  }
  return false;
}

function attachRoas(bucket: Record<string, unknown>) {
  const spend = Number(bucket.spend || 0);
  const won = Number(bucket.won_revenue || 0);
  const wonCount = Number(bucket.won_count || 0);
  bucket.won_revenue = Math.round(won * 100) / 100;
  bucket.open_value = Math.round(Number(bucket.open_value || 0) * 100) / 100;
  bucket.lost_value = Math.round(Number(bucket.lost_value || 0) * 100) / 100;
  bucket.abandoned_value =
    Math.round(Number(bucket.abandoned_value || 0) * 100) / 100;
  bucket.spend = Math.round(spend * 100) / 100;
  bucket.roas = spend > 0 ? Math.round((won / spend) * 10_000) / 10_000 : null;
  bucket.cost_per_won =
    wonCount > 0 ? Math.round((spend / wonCount) * 100) / 100 : null;
}

export async function summarizeCrmReturns(
  location: LocationRow,
  startDate: string,
  endDate: string,
): Promise<Record<string, unknown>> {
  const setup = await getOrCreateCrmSetup(location.id);
  const bounds = dayBounds(startDate, endDate);

  const db = supabaseAdmin();
  let query = db
    .from("ghl_opportunities")
    .select(
      "status, source_channel, monetary_value, last_status_change_at, ghl_created_at, created_at",
    )
    .eq("location_id", location.id);

  if (setup.pipeline_id) {
    query = query.eq("pipeline_id", setup.pipeline_id);
  }

  const { data: rows } = await query;
  const filtered = (rows || []).filter((row) =>
    inRange(row, bounds.start, bounds.end),
  );

  const facebook = channelBucket();
  const google = channelBucket();
  const other = channelBucket();
  const overall = channelBucket();

  const buckets: Record<SourceChannel, Record<string, unknown>> = {
    facebook,
    google,
    other,
  };

  for (const row of filtered) {
    const channel = (row.source_channel as SourceChannel) || "other";
    const bucket = buckets[channel] || other;
    const value = toDecimal(row.monetary_value) ?? 0;
    const status = row.status as OpportunityStatus;

    const targets = [bucket, overall];
    if (status === "won") {
      for (const b of targets) {
        b.won_revenue = Number(b.won_revenue) + value;
        b.won_count = Number(b.won_count) + 1;
      }
    } else if (status === "open") {
      for (const b of targets) {
        b.open_value = Number(b.open_value) + value;
        b.open_count = Number(b.open_count) + 1;
      }
    } else if (status === "lost") {
      for (const b of targets) {
        b.lost_value = Number(b.lost_value) + value;
        b.lost_count = Number(b.lost_count) + 1;
      }
    } else if (status === "abandoned") {
      for (const b of targets) {
        b.abandoned_value = Number(b.abandoned_value) + value;
        b.abandoned_count = Number(b.abandoned_count) + 1;
      }
    }
  }

  const meta = await summarizeMetaAds(location, startDate, endDate);
  const googleAds = await summarizeGoogleAds(location, startDate, endDate);
  const metaSpend = Number((meta.totals as Record<string, unknown>)?.spend || 0);
  const googleSpend = Number(
    (googleAds.totals as Record<string, unknown>)?.spend || 0,
  );

  facebook.spend = metaSpend;
  google.spend = googleSpend;
  overall.spend = metaSpend + googleSpend;

  for (const b of [facebook, google, other, overall]) {
    attachRoas(b);
  }

  const byStatus: Record<string, { count: number; value: number }> = {};
  for (const row of filtered) {
    const status = String(row.status || "other");
    if (!byStatus[status]) byStatus[status] = { count: 0, value: 0 };
    byStatus[status].count += 1;
    byStatus[status].value += toDecimal(row.monetary_value) ?? 0;
  }

  return {
    location_id: location.ghl_location_id,
    start_date: startDate,
    end_date: endDate,
    crm: await serializeCrmSetup(setup, location.ghl_location_id),
    overall,
    facebook,
    google,
    other,
    by_status: byStatus,
    opportunity_count: filtered.length,
  };
}

export async function listOpportunities(
  location: LocationRow,
  status?: string,
  sourceChannel?: string,
  limit = 100,
): Promise<Record<string, unknown>[]> {
  const setup = await getOrCreateCrmSetup(location.id);
  const capped = Math.max(1, Math.min(limit, 500));

  const db = supabaseAdmin();
  let query = db
    .from("ghl_opportunities")
    .select(
      "id, ghl_opportunity_id, name, status, status_raw, monetary_value, source_raw, source_channel, pipeline_id, pipeline_stage_id, pipeline_stage_name, ghl_created_at, last_status_change_at",
    )
    .eq("location_id", location.id)
    .order("last_status_change_at", { ascending: false, nullsFirst: false })
    .order("ghl_created_at", { ascending: false, nullsFirst: false })
    .limit(capped);

  if (setup.pipeline_id) query = query.eq("pipeline_id", setup.pipeline_id);
  if (status) query = query.eq("status", status);
  if (sourceChannel) query = query.eq("source_channel", sourceChannel);

  const { data: rows } = await query;
  return (rows || []).map((row) => ({
    id: row.id,
    ghl_opportunity_id: row.ghl_opportunity_id,
    name: row.name,
    status: row.status,
    status_raw: row.status_raw,
    monetary_value: toDecimal(row.monetary_value) ?? 0,
    source_raw: row.source_raw,
    source_channel: row.source_channel,
    pipeline_id: row.pipeline_id,
    pipeline_stage_id: row.pipeline_stage_id,
    pipeline_stage_name: row.pipeline_stage_name,
    ghl_created_at: row.ghl_created_at,
    last_status_change_at: row.last_status_change_at,
  }));
}
