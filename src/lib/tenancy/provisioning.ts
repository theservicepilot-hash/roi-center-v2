import { randomBytes } from "crypto";

import { encryptSecret } from "@/lib/crypto";
import type { GhlTokenPayload } from "@/lib/ghl/oauth";
import {
  exchangeLocationToken,
  listInstalledLocations,
} from "@/lib/ghl/oauth";
import { permissionsForRole } from "@/lib/auth/permissions";
import { signAccessToken, signRefreshToken } from "@/lib/auth/session";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { enqueueJobs } from "@/lib/jobs/queue";
import { kickJobQueue } from "@/lib/jobs/kick";

function tokenFields(payload: GhlTokenPayload) {
  const expiresIn = Number(payload.expires_in || 0);
  const expiresAt =
    expiresIn > 0
      ? new Date(Date.now() + expiresIn * 1000).toISOString()
      : null;
  return {
    access_token_enc: encryptSecret(String(payload.access_token || "")),
    refresh_token_enc: encryptSecret(String(payload.refresh_token || "")),
    token_expires_at: expiresAt,
    scope: String(payload.scope || ""),
  };
}

export async function upsertAgency(
  companyId: string,
  opts: { name?: string; tokens?: GhlTokenPayload } = {},
) {
  const db = supabaseAdmin();
  const patch: Record<string, unknown> = {
    ghl_company_id: companyId,
    is_active: true,
    updated_at: new Date().toISOString(),
  };
  if (opts.name) patch.name = opts.name;
  if (opts.tokens) Object.assign(patch, tokenFields(opts.tokens));

  const { data: existing } = await db
    .from("agencies")
    .select("id")
    .eq("ghl_company_id", companyId)
    .maybeSingle();

  if (existing) {
    const { data, error } = await db
      .from("agencies")
      .update(patch)
      .eq("id", existing.id)
      .select("*")
      .single();
    if (error) throw error;
    return data;
  }

  const { data, error } = await db
    .from("agencies")
    .insert({ ...patch, name: opts.name || companyId })
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

export async function upsertLocation(opts: {
  ghlLocationId: string;
  agencyId?: string | null;
  name?: string;
  ghlUserId?: string;
  tokens?: GhlTokenPayload;
}) {
  const db = supabaseAdmin();
  const patch: Record<string, unknown> = {
    ghl_location_id: opts.ghlLocationId,
    is_active: true,
    status: "active",
    updated_at: new Date().toISOString(),
  };
  if (opts.agencyId) patch.agency_id = opts.agencyId;
  if (opts.name) patch.name = opts.name;
  if (opts.ghlUserId) patch.ghl_user_id = opts.ghlUserId;
  if (opts.tokens) Object.assign(patch, tokenFields(opts.tokens));

  const { data: existing } = await db
    .from("locations")
    .select("id")
    .eq("ghl_location_id", opts.ghlLocationId)
    .maybeSingle();

  if (existing) {
    const { data, error } = await db
      .from("locations")
      .update(patch)
      .eq("id", existing.id)
      .select("*")
      .single();
    if (error) throw error;
    return data;
  }

  const { data, error } = await db
    .from("locations")
    .insert({
      ...patch,
      name: opts.name || opts.ghlLocationId,
      onboarded_at: new Date().toISOString(),
    })
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

export async function upsertUser(opts: {
  email: string;
  name?: string;
  ghlUserId?: string;
  ghlCompanyId?: string;
}) {
  const db = supabaseAdmin();
  const email = opts.email.trim().toLowerCase();
  const { data: existing } = await db
    .from("users")
    .select("*")
    .eq("email", email)
    .maybeSingle();

  const patch = {
    email,
    name: opts.name || existing?.name || email.split("@")[0],
    ghl_user_id: opts.ghlUserId || existing?.ghl_user_id || "",
    ghl_company_id: opts.ghlCompanyId || existing?.ghl_company_id || "",
    is_active: true,
    updated_at: new Date().toISOString(),
  };

  if (existing) {
    const { data, error } = await db
      .from("users")
      .update(patch)
      .eq("id", existing.id)
      .select("*")
      .single();
    if (error) throw error;
    return data;
  }

  const { data, error } = await db.from("users").insert(patch).select("*").single();
  if (error) throw error;
  return data;
}

export async function ensureMembership(
  userId: string,
  locationId: string,
  role = "agency_admin",
) {
  const db = supabaseAdmin();
  const { data: existing } = await db
    .from("memberships")
    .select("*")
    .eq("user_id", userId)
    .eq("location_id", locationId)
    .maybeSingle();

  if (existing) {
    const { data, error } = await db
      .from("memberships")
      .update({ is_active: true, role, updated_at: new Date().toISOString() })
      .eq("id", existing.id)
      .select("*")
      .single();
    if (error) throw error;
    return data;
  }

  const { data, error } = await db
    .from("memberships")
    .insert({ user_id: userId, location_id: locationId, role, is_active: true })
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

export async function enqueueOnboardBackfill(ghlLocationIds: string[]) {
  for (const loc of ghlLocationIds) {
    if (!loc) continue;
    try {
      await enqueueJobs([
        { type: "meta.onboard", payload: { ghlLocationId: loc } },
        { type: "google.onboard", payload: { ghlLocationId: loc } },
      ]);
      kickJobQueue(2);
    } catch (e) {
      console.error("Failed to enqueue onboard backfill", loc, e);
    }
  }
}

export async function createLoginCode(userId: string, locationId: string) {
  const db = supabaseAdmin();
  const code = randomBytes(24).toString("hex");
  const expires = new Date(Date.now() + 180_000).toISOString();
  const { error } = await db.from("oauth_login_codes").insert({
    code,
    user_id: userId,
    location_id: locationId,
    expires_at: expires,
  });
  if (error) throw error;
  return code;
}

export async function issueSessionForMembership(
  user: { id: string; email: string },
  location: { id: string; ghl_location_id: string; name?: string },
  role: string,
) {
  const permissions = permissionsForRole(role);
  const access = await signAccessToken({
    sub: user.id,
    email: user.email,
    location_id: location.id,
    ghl_location_id: location.ghl_location_id,
    role,
    permissions,
  });
  const refresh = await signRefreshToken({ sub: user.id, email: user.email });
  return {
    access,
    refresh,
    user: { id: user.id, email: user.email },
    location: {
      id: location.id,
      ghl_location_id: location.ghl_location_id,
      name: location.name || location.ghl_location_id,
    },
    role,
    permissions,
  };
}

/** Full OAuth onboard from token payload. */
export async function onboardFromTokenPayload(
  payload: GhlTokenPayload,
  opts: { initiatorUserId?: string | null; installerEmail?: string } = {},
) {
  const companyId = String(payload.companyId || "").trim();
  const locationId = String(payload.locationId || "").trim();
  const userId = String(payload.userId || "").trim();
  const onboarded: string[] = [];

  let agency = companyId
    ? await upsertAgency(companyId, {
        tokens: locationId ? undefined : payload,
        name: companyId,
      })
    : null;

  if (companyId && locationId) {
    // Location-level install — also store location tokens
    if (payload.access_token && !agency) {
      agency = await upsertAgency(companyId, { tokens: payload });
    } else if (agency && payload.access_token && !locationId) {
      // noop
    }
  }

  if (companyId && !locationId && payload.access_token) {
    agency = await upsertAgency(companyId, { tokens: payload });
    const installed = await listInstalledLocations(
      companyId,
      String(payload.access_token),
    );
    for (const locId of installed) {
      try {
        const locTokens = await exchangeLocationToken(
          companyId,
          String(payload.access_token),
          locId,
        );
        if (userId && !locTokens.userId) locTokens.userId = userId;
        const loc = await upsertLocation({
          ghlLocationId: locId,
          agencyId: agency.id,
          ghlUserId: String(locTokens.userId || userId || ""),
          tokens: locTokens,
        });
        onboarded.push(loc.ghl_location_id);
      } catch (e) {
        console.error("locationToken failed", locId, e);
      }
    }
  } else if (locationId) {
    if (companyId) {
      agency = await upsertAgency(companyId, {
        tokens: payload.refresh_token ? payload : undefined,
      });
    }
    const loc = await upsertLocation({
      ghlLocationId: locationId,
      agencyId: agency?.id,
      ghlUserId: userId,
      tokens: payload,
    });
    onboarded.push(loc.ghl_location_id);
  }

  await enqueueOnboardBackfill(onboarded);

  // Ensure a user + membership for session
  const primaryGhlLoc = onboarded[0];
  if (!primaryGhlLoc) {
    return { onboarded, loginCode: null as string | null };
  }

  const db = supabaseAdmin();
  const { data: location } = await db
    .from("locations")
    .select("*")
    .eq("ghl_location_id", primaryGhlLoc)
    .single();

  let user =
    opts.initiatorUserId
      ? (
          await db.from("users").select("*").eq("id", opts.initiatorUserId).maybeSingle()
        ).data
      : null;

  if (!user && opts.installerEmail) {
    user = await upsertUser({
      email: opts.installerEmail,
      ghlUserId: userId,
      ghlCompanyId: companyId,
    });
  }
  if (!user) {
    user = await upsertUser({
      email: `ghl-${userId || primaryGhlLoc}@roi-center.local`,
      ghlUserId: userId,
      ghlCompanyId: companyId,
      name: "GHL Installer",
    });
  }

  await ensureMembership(user.id, location.id, "agency_admin");
  const loginCode = await createLoginCode(user.id, location.id);

  return { onboarded, loginCode, location, user };
}

export async function consumeLoginCode(code: string) {
  const db = supabaseAdmin();
  const { data: row } = await db
    .from("oauth_login_codes")
    .select("*, user:users(*), location:locations(*)")
    .eq("code", code)
    .is("used_at", null)
    .maybeSingle();

  if (!row || new Date(row.expires_at) < new Date()) {
    return null;
  }

  await db
    .from("oauth_login_codes")
    .update({ used_at: new Date().toISOString() })
    .eq("id", row.id);

  const { data: membership } = await db
    .from("memberships")
    .select("role")
    .eq("user_id", row.user_id)
    .eq("location_id", row.location_id)
    .eq("is_active", true)
    .maybeSingle();

  return issueSessionForMembership(
    row.user as { id: string; email: string },
    row.location as { id: string; ghl_location_id: string; name?: string },
    membership?.role || "agency_admin",
  );
}
