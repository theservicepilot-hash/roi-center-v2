import { NextRequest } from "next/server";

import {
  Permissions,
  hasPermission,
  permissionsForRole,
  type Permission,
} from "@/lib/auth/permissions";
import { verifyAccessToken, type SessionPayload } from "@/lib/auth/session";
import { decryptSecret } from "@/lib/crypto";
import { supabaseAdmin } from "@/lib/supabase/admin";

export class ApiError extends Error {
  status: number;
  code: string;

  constructor(message: string, status = 400, code = "error") {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function jsonOk<T>(data: T, status = 200) {
  return Response.json(data, { status });
}

export function jsonError(err: unknown) {
  if (err instanceof ApiError) {
    return Response.json(
      { error: { message: err.message, code: err.code } },
      { status: err.status },
    );
  }
  console.error(err);
  return Response.json(
    { error: { message: "Internal server error", code: "internal" } },
    { status: 500 },
  );
}

export interface LocationRow {
  id: string;
  agency_id: string | null;
  ghl_location_id: string;
  name: string;
  is_active: boolean;
  access_token_enc: string;
  refresh_token_enc: string;
  token_expires_at: string | null;
  scope: string;
  agency?: {
    id: string;
    access_token_enc: string;
    refresh_token_enc: string;
  } | null;
}

export interface AuthContext {
  session: SessionPayload;
  location: LocationRow;
  permissions: Permission[];
}

function bearer(req: NextRequest): string | null {
  const h = req.headers.get("authorization") || "";
  if (h.toLowerCase().startsWith("bearer ")) return h.slice(7).trim();
  return null;
}

export async function requireAuth(req: NextRequest): Promise<AuthContext> {
  const token = bearer(req);
  if (!token) throw new ApiError("Unauthorized", 401, "unauthorized");

  const session = await verifyAccessToken(token);
  if (!session) throw new ApiError("Invalid session", 401, "unauthorized");

  const ghlLoc =
    req.headers.get("x-location-id") ||
    req.nextUrl.searchParams.get("location_id") ||
    session.ghl_location_id;

  const db = supabaseAdmin();
  const { data: location, error } = await db
    .from("locations")
    .select(
      "id, agency_id, ghl_location_id, name, is_active, access_token_enc, refresh_token_enc, token_expires_at, scope, agency:agencies(id, access_token_enc, refresh_token_enc)",
    )
    .eq("ghl_location_id", ghlLoc)
    .eq("is_active", true)
    .maybeSingle();

  if (error || !location) {
    throw new ApiError("Location not found", 404, "location_not_found");
  }

  const { data: membership } = await db
    .from("memberships")
    .select("role, permission_grants, permission_denies, is_active")
    .eq("user_id", session.sub)
    .eq("location_id", location.id)
    .eq("is_active", true)
    .maybeSingle();

  if (!membership) {
    throw new ApiError("Not a member of this location", 403, "forbidden");
  }

  const permissions = permissionsForRole(
    membership.role,
    (membership.permission_grants as string[]) || [],
    (membership.permission_denies as string[]) || [],
  );

  return {
    session: {
      ...session,
      location_id: location.id,
      ghl_location_id: location.ghl_location_id,
      role: membership.role,
      permissions,
    },
    location: location as unknown as LocationRow,
    permissions,
  };
}

export function requirePerm(ctx: AuthContext, perm: Permission) {
  if (!hasPermission(ctx.permissions, perm)) {
    throw new ApiError(`Missing permission ${perm}`, 403, "forbidden");
  }
}

export { Permissions };

export function resolveLocationAccessToken(location: LocationRow): string | null {
  const loc = decryptSecret(location.access_token_enc || "").trim();
  if (loc) return loc;
  const agency = location.agency;
  if (agency) {
    const a = decryptSecret(agency.access_token_enc || "").trim();
    if (a) return a;
  }
  return null;
}

export function parseDateParam(
  raw: string | null,
  field: string,
): string | null {
  if (!raw) return null;
  const s = raw.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    throw new ApiError(`Invalid ${field}. Use YYYY-MM-DD.`, 400, "validation");
  }
  return s;
}

export function rangeFromRequest(req: NextRequest): {
  start: string;
  end: string;
} {
  const end =
    parseDateParam(req.nextUrl.searchParams.get("end_date"), "end_date") ||
    new Date().toISOString().slice(0, 10);
  let start = parseDateParam(
    req.nextUrl.searchParams.get("start_date"),
    "start_date",
  );
  if (!start) {
    const d = new Date(`${end}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() - 29);
    start = d.toISOString().slice(0, 10);
  }
  if (start > end) {
    throw new ApiError("start_date must be on or before end_date.", 400);
  }
  return { start, end };
}
