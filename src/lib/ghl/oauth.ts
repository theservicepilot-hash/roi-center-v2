import { ghlConfig } from "@/lib/env";
import { ghlPostForm, ghlGet } from "@/lib/ghl/http";

export interface GhlTokenPayload {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number | string;
  scope?: string;
  companyId?: string;
  locationId?: string;
  userId?: string;
  [key: string]: unknown;
}

export function buildAuthorizeUrl(state: string): string {
  const cfg = ghlConfig();
  const url = new URL(
    "https://marketplace.gohighlevel.com/v2/oauth/chooselocation",
  );
  url.searchParams.set("response_type", "code");
  url.searchParams.set("redirect_uri", cfg.redirectUri);
  url.searchParams.set("client_id", cfg.clientId);
  url.searchParams.set("scope", cfg.scopes);
  if (cfg.versionId) url.searchParams.set("version_id", cfg.versionId);
  if (state) url.searchParams.set("state", state);
  return url.toString();
}

export async function exchangeCode(code: string): Promise<GhlTokenPayload> {
  const cfg = ghlConfig();
  return ghlPostForm("/oauth/token", {
    grant_type: "authorization_code",
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
    redirect_uri: cfg.redirectUri,
    code,
  });
}

export async function refreshToken(
  refresh_token: string,
): Promise<GhlTokenPayload> {
  const cfg = ghlConfig();
  return ghlPostForm("/oauth/token", {
    grant_type: "refresh_token",
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
    refresh_token,
  });
}

export async function exchangeLocationToken(
  companyId: string,
  companyAccessToken: string,
  locationId: string,
): Promise<GhlTokenPayload> {
  const payload = await ghlPostForm(
    "/oauth/locationToken",
    { companyId, locationId },
    { Authorization: `Bearer ${companyAccessToken}` },
  );
  if (!payload.locationId) payload.locationId = locationId;
  if (!payload.companyId) payload.companyId = companyId;
  return payload;
}

export async function listInstalledLocations(
  companyId: string,
  companyAccessToken: string,
): Promise<string[]> {
  const cfg = ghlConfig();
  const appId = cfg.clientId.split("-")[0] || cfg.clientId;
  const payload = (await ghlGet(
    companyAccessToken,
    "/oauth/installedLocations",
    { companyId, appId },
  )) as { locations?: Array<{ id?: string; _id?: string }> };

  const rows = payload.locations || [];
  return rows
    .map((r) => String(r.id || r._id || "").trim())
    .filter(Boolean);
}
