import { NextRequest } from "next/server";

import { decryptSecret, encryptSecret } from "@/lib/crypto";
import {
  exchangeLocationToken,
  refreshToken,
} from "@/lib/ghl/oauth";
import { handleOpportunityWebhook } from "@/lib/roi/crm-webhooks";
import {
  enqueueOnboardBackfill,
  upsertAgency,
  upsertLocation,
} from "@/lib/tenancy/provisioning";
import { supabaseAdmin } from "@/lib/supabase/admin";

export async function POST(req: NextRequest) {
  // Always 200 to GHL — log and handle best-effort
  let payload: Record<string, unknown> = {};
  try {
    payload = (await req.json()) as Record<string, unknown>;
  } catch {
    return Response.json({ ok: true, action: "ignored" });
  }

  const type = String(payload.type || payload.event || "").trim();

  try {
    if (type === "INSTALL") {
      await handleInstall(payload);
    } else if (type === "UNINSTALL") {
      await handleUninstall(payload);
    } else if (type.startsWith("Opportunity")) {
      await handleOpportunityWebhook(payload);
    }
  } catch (e) {
    console.error("webhook handler error", type, e);
  }

  return Response.json({ ok: true });
}

async function handleInstall(payload: Record<string, unknown>) {
  const locationId = String(
    payload.locationId || payload.location_id || "",
  ).trim();
  const companyId = String(
    payload.companyId || payload.company_id || "",
  ).trim();
  const userId = String(payload.userId || payload.user_id || "").trim();
  if (!locationId || !companyId) return;

  const db = supabaseAdmin();
  const { data: existing } = await db
    .from("locations")
    .select("id, access_token_enc, is_active")
    .eq("ghl_location_id", locationId)
    .maybeSingle();

  if (
    existing?.is_active &&
    decryptSecret(existing.access_token_enc || "").trim()
  ) {
    return;
  }

  const { data: agency } = await db
    .from("agencies")
    .select("*")
    .eq("ghl_company_id", companyId)
    .eq("is_active", true)
    .maybeSingle();

  if (!agency) {
    console.warn("INSTALL without company tokens", companyId, locationId);
    return;
  }

  const companyToken = decryptSecret(agency.access_token_enc || "").trim();
  if (!companyToken) return;

  // Refresh company token if needed, then locationToken
  let access = companyToken;
  const refresh = decryptSecret(agency.refresh_token_enc || "").trim();
  if (refresh) {
    try {
      const refreshed = await refreshToken(refresh);
      await upsertAgency(companyId, {
        tokens: refreshed,
        name: String(payload.companyName || agency.name || ""),
      });
      access = String(refreshed.access_token || access);
    } catch (e) {
      console.error("company refresh on INSTALL failed", e);
    }
  }

  const locTokens = await exchangeLocationToken(companyId, access, locationId);
  if (userId && !locTokens.userId) locTokens.userId = userId;

  await upsertLocation({
    ghlLocationId: locationId,
    agencyId: agency.id,
    ghlUserId: userId,
    name: String(payload.locationName || locationId),
    tokens: locTokens,
  });

  await enqueueOnboardBackfill([locationId]);
}

async function handleUninstall(payload: Record<string, unknown>) {
  const locationId = String(
    payload.locationId || payload.location_id || "",
  ).trim();
  if (!locationId) return;
  const db = supabaseAdmin();
  await db
    .from("locations")
    .update({
      is_active: false,
      status: "churned",
      access_token_enc: encryptSecret(""),
      refresh_token_enc: encryptSecret(""),
      updated_at: new Date().toISOString(),
    })
    .eq("ghl_location_id", locationId);

  const { data: loc } = await db
    .from("locations")
    .select("id")
    .eq("ghl_location_id", locationId)
    .maybeSingle();
  if (loc) {
    await db
      .from("memberships")
      .update({ is_active: false })
      .eq("location_id", loc.id);
  }
}
