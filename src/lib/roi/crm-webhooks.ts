import { type LocationRow } from "@/lib/auth/request";
import {
  getOrCreateCrmSetup,
  upsertOpportunity,
} from "@/lib/roi/crm-sync";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const OPPORTUNITY_UPSERT_TYPES = new Set([
  "OpportunityCreate",
  "OpportunityUpdate",
  "OpportunityStageUpdate",
  "OpportunityStatusUpdate",
  "OpportunityMonetaryValueUpdate",
  "OpportunityAssignmentUpdate",
]);

export const OPPORTUNITY_DELETE_TYPES = new Set(["OpportunityDelete"]);

async function resolveLocation(
  payload: Record<string, unknown>,
): Promise<LocationRow | null> {
  const ghlLocationId = String(
    payload.locationId || payload.location_id || "",
  ).trim();
  if (!ghlLocationId) return null;

  const db = supabaseAdmin();
  const { data } = await db
    .from("locations")
    .select(
      "id, agency_id, ghl_location_id, name, is_active, access_token_enc, refresh_token_enc, token_expires_at, scope",
    )
    .eq("ghl_location_id", ghlLocationId)
    .eq("is_active", true)
    .maybeSingle();

  return (data as unknown as LocationRow) || null;
}

async function refreshOpportunityCount(location: LocationRow): Promise<number> {
  const setup = await getOrCreateCrmSetup(location.id);
  const db = supabaseAdmin();

  let count = 0;
  if (setup.pipeline_id) {
    const { count: c } = await db
      .from("ghl_opportunities")
      .select("id", { count: "exact", head: true })
      .eq("location_id", location.id)
      .eq("pipeline_id", setup.pipeline_id);
    count = c || 0;
  } else {
    const { count: c } = await db
      .from("ghl_opportunities")
      .select("id", { count: "exact", head: true })
      .eq("location_id", location.id);
    count = c || 0;
  }

  const now = new Date().toISOString();
  await db
    .from("roi_crm_setups")
    .update({
      opportunities_synced: count,
      last_synced_at: now,
      sync_status: "success",
      last_sync_error: "",
      updated_at: now,
    })
    .eq("location_id", location.id);

  return count;
}

async function handleOpportunityDelete(
  payload: Record<string, unknown>,
  eventType: string,
): Promise<Record<string, unknown>> {
  const location = await resolveLocation(payload);
  if (!location) {
    return {
      ok: true,
      action: "ignored",
      type: eventType,
      reason: "unknown_location",
    };
  }

  const oid = String(payload.id || payload._id || "").trim();
  if (!oid) {
    return {
      ok: true,
      action: "ignored",
      type: eventType,
      reason: "missing_opportunity_id",
    };
  }

  const db = supabaseAdmin();
  const { count } = await db
    .from("ghl_opportunities")
    .delete({ count: "exact" })
    .eq("location_id", location.id)
    .eq("ghl_opportunity_id", oid);

  const synced = await refreshOpportunityCount(location);
  console.info("GHL webhook delete", {
    eventType,
    location: location.ghl_location_id,
    oid,
    deleted: count,
  });

  return {
    ok: true,
    action: count ? "deleted" : "noop",
    type: eventType,
    location_id: location.ghl_location_id,
    opportunity_id: oid,
    opportunities_synced: synced,
  };
}

async function handleOpportunityUpsert(
  payload: Record<string, unknown>,
  eventType: string,
): Promise<Record<string, unknown>> {
  const location = await resolveLocation(payload);
  if (!location) {
    return {
      ok: true,
      action: "ignored",
      type: eventType,
      reason: "unknown_location",
    };
  }

  const setup = await getOrCreateCrmSetup(location.id);
  const pipelineId = String(payload.pipelineId || "").trim();

  if (setup.setup_status !== "confirmed" || !setup.pipeline_id) {
    return {
      ok: true,
      action: "skipped",
      type: eventType,
      reason: "pipeline_not_confirmed",
      location_id: location.ghl_location_id,
    };
  }

  const oid = String(payload.id || payload._id || "").trim();
  if (pipelineId && pipelineId !== setup.pipeline_id) {
    let deleted = 0;
    if (oid) {
      const db = supabaseAdmin();
      const { count } = await db
        .from("ghl_opportunities")
        .delete({ count: "exact" })
        .eq("location_id", location.id)
        .eq("ghl_opportunity_id", oid);
      deleted = count || 0;
      if (deleted) await refreshOpportunityCount(location);
    }
    return {
      ok: true,
      action: deleted ? "deleted_out_of_pipeline" : "skipped",
      type: eventType,
      reason: "pipeline_mismatch",
      location_id: location.ghl_location_id,
      opportunity_id: oid,
    };
  }

  const body = { ...payload };
  if (!body.pipelineId) body.pipelineId = setup.pipeline_id;

  try {
    const row = await upsertOpportunity(location, body);
    const count = await refreshOpportunityCount(location);
    console.info("GHL webhook upsert", {
      eventType,
      location: location.ghl_location_id,
      opp: row.ghl_opportunity_id,
    });
    return {
      ok: true,
      action: "upserted",
      type: eventType,
      location_id: location.ghl_location_id,
      opportunity_id: row.ghl_opportunity_id,
      opportunities_synced: count,
    };
  } catch (err) {
    console.error("GHL webhook upsert failed", {
      eventType,
      location: location.ghl_location_id,
      err,
    });
    return {
      ok: false,
      action: "error",
      type: eventType,
      reason: (err instanceof Error ? err.message : String(err)).slice(0, 500),
      location_id: location.ghl_location_id,
    };
  }
}

export async function handleOpportunityWebhook(
  payload: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  if (!payload || typeof payload !== "object") {
    return { ok: false, action: "ignored", reason: "invalid_payload" };
  }

  const eventType = String(payload.type || payload.event || "").trim();
  if (OPPORTUNITY_DELETE_TYPES.has(eventType)) {
    return handleOpportunityDelete(payload, eventType);
  }
  if (OPPORTUNITY_UPSERT_TYPES.has(eventType)) {
    return handleOpportunityUpsert(payload, eventType);
  }

  console.info("GHL opportunity webhook ignored", { eventType });
  return { ok: true, action: "ignored", type: eventType };
}
