import { type LocationRow, resolveLocationAccessToken } from "@/lib/auth/request";
import { decryptSecret } from "@/lib/crypto";
import {
  exchangeLocationToken,
  refreshToken,
  type GhlTokenPayload,
} from "@/lib/ghl/oauth";
import { IntegrationError } from "@/lib/roi/meta-sync";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { upsertAgency, upsertLocation } from "@/lib/tenancy/provisioning";

type AgencyRow = {
  id: string;
  ghl_company_id: string;
  refresh_token_enc: string;
};

export type LocationTokenRow = LocationRow & {
  refresh_token_enc: string;
  agency?: AgencyRow | null;
};

export async function loadLocationWithAgency(
  locationId: string,
): Promise<LocationTokenRow | null> {
  const db = supabaseAdmin();
  const { data } = await db
    .from("locations")
    .select(
      "id, agency_id, ghl_location_id, name, is_active, access_token_enc, refresh_token_enc, token_expires_at, scope, agency:agencies(id, ghl_company_id, access_token_enc, refresh_token_enc)",
    )
    .eq("id", locationId)
    .eq("is_active", true)
    .maybeSingle();
  return (data as unknown as LocationTokenRow) || null;
}

export async function loadLocationByGhlId(
  ghlLocationId: string,
): Promise<LocationTokenRow | null> {
  const db = supabaseAdmin();
  const { data } = await db
    .from("locations")
    .select(
      "id, agency_id, ghl_location_id, name, is_active, access_token_enc, refresh_token_enc, token_expires_at, scope, agency:agencies(id, ghl_company_id, access_token_enc, refresh_token_enc)",
    )
    .eq("ghl_location_id", ghlLocationId)
    .eq("is_active", true)
    .maybeSingle();
  return (data as unknown as LocationTokenRow) || null;
}

export async function refreshLocationAccessToken(
  location: LocationTokenRow,
): Promise<string | null> {
  const agency = location.agency;
  const agencyRefresh = agency
    ? decryptSecret(agency.refresh_token_enc || "").trim()
    : "";

  if (agency && agencyRefresh) {
    try {
      const agencyPayload = await refreshToken(agencyRefresh);
      const companyToken = String(agencyPayload.access_token || "").trim();
      if (!companyToken) return null;

      await upsertAgency(agency.ghl_company_id, { tokens: agencyPayload });
      const locTokens = await exchangeLocationToken(
        agency.ghl_company_id,
        companyToken,
        location.ghl_location_id,
      );
      await upsertLocation({
        ghlLocationId: location.ghl_location_id,
        agencyId: agency.id,
        tokens: locTokens,
      });

      const refreshed = await loadLocationWithAgency(location.id);
      return refreshed ? resolveLocationAccessToken(refreshed) : companyToken;
    } catch (err) {
      console.error(
        "Failed refreshing location token via agency",
        location.ghl_location_id,
        err,
      );
    }
  }

  const refresh = decryptSecret(location.refresh_token_enc || "").trim();
  if (refresh) {
    try {
      const payload = await refreshToken(refresh);
      await upsertLocation({
        ghlLocationId: location.ghl_location_id,
        agencyId: location.agency_id,
        tokens: payload,
      });
      const refreshed = await loadLocationWithAgency(location.id);
      return refreshed ? resolveLocationAccessToken(refreshed) : null;
    } catch (err) {
      console.error(
        "Failed refreshing location token",
        location.ghl_location_id,
        err,
      );
    }
  }

  return null;
}

export async function ensureLocationAccessToken(
  location: LocationTokenRow,
  forceRefresh = false,
): Promise<string> {
  let token = forceRefresh ? null : resolveLocationAccessToken(location);
  if (!token || forceRefresh) {
    token = (await refreshLocationAccessToken(location)) || token;
  }
  if (!token) {
    throw new IntegrationError(
      "No GHL access token available for this location.",
      "missing_ghl_token",
    );
  }
  return token;
}

export async function refreshAllTokens(): Promise<Record<string, number>> {
  const db = supabaseAdmin();
  let agencyOk = 0;
  let agencyErr = 0;
  let locOk = 0;
  let locErr = 0;

  const { data: agencies } = await db
    .from("agencies")
    .select("id, ghl_company_id, refresh_token_enc")
    .eq("is_active", true);

  for (const agency of agencies || []) {
    const refresh = decryptSecret(agency.refresh_token_enc || "").trim();
    if (!refresh) {
      agencyErr += 1;
      continue;
    }

    try {
      const payload: GhlTokenPayload = await refreshToken(refresh);
      const access = String(payload.access_token || "").trim();
      if (!access) {
        agencyErr += 1;
        console.warn(
          "refreshAllTokens: no access_token for company",
          agency.ghl_company_id,
        );
        continue;
      }

      await upsertAgency(agency.ghl_company_id, { tokens: payload });
      agencyOk += 1;

      const { data: locations } = await db
        .from("locations")
        .select("id, ghl_location_id")
        .eq("agency_id", agency.id)
        .eq("is_active", true);

      for (const location of locations || []) {
        try {
          const locTokens = await exchangeLocationToken(
            agency.ghl_company_id,
            access,
            location.ghl_location_id,
          );
          await upsertLocation({
            ghlLocationId: location.ghl_location_id,
            agencyId: agency.id,
            tokens: locTokens,
          });
          locOk += 1;
        } catch (err) {
          locErr += 1;
          console.error(
            "refreshAllTokens: location token failed",
            location.ghl_location_id,
            err,
          );
        }
      }
    } catch (err) {
      agencyErr += 1;
      console.error(
        "refreshAllTokens: agency refresh failed",
        agency.ghl_company_id,
        err,
      );
    }
  }

  const { data: orphanLocations } = await db
    .from("locations")
    .select(
      "id, agency_id, ghl_location_id, refresh_token_enc, access_token_enc, token_expires_at, scope, name, is_active, agency:agencies(id, ghl_company_id, refresh_token_enc, access_token_enc)",
    )
    .eq("is_active", true)
    .neq("refresh_token_enc", "");

  for (const loc of orphanLocations || []) {
    const location = loc as unknown as LocationTokenRow;
    const agencyRefresh = location.agency
      ? decryptSecret(location.agency.refresh_token_enc || "").trim()
      : "";
    if (location.agency_id && agencyRefresh) continue;

    const refresh = decryptSecret(location.refresh_token_enc || "").trim();
    if (!refresh) continue;

    try {
      const payload = await refreshToken(refresh);
      await upsertLocation({
        ghlLocationId: location.ghl_location_id,
        agencyId: location.agency_id,
        tokens: payload,
      });
      locOk += 1;
    } catch (err) {
      locErr += 1;
      console.error(
        "refreshAllTokens: orphan location refresh failed",
        location.ghl_location_id,
        err,
      );
    }
  }

  const result = {
    agency_success: agencyOk,
    agency_errors: agencyErr,
    location_success: locOk,
    location_errors: locErr,
  };
  console.info("refreshAllTokens done", result);
  return result;
}
