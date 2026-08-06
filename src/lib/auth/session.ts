import { SignJWT, jwtVerify } from "jose";

import { getEnv } from "@/lib/env";
import type { Permission } from "@/lib/auth/permissions";

export interface SessionPayload {
  sub: string; // user uuid
  email: string;
  location_id: string; // internal uuid
  ghl_location_id: string;
  role: string;
  permissions: Permission[];
}

function secretKey() {
  return new TextEncoder().encode(getEnv().SESSION_SECRET);
}

export async function signAccessToken(
  payload: SessionPayload,
  expiresIn = "12h",
): Promise<string> {
  return new SignJWT({
    email: payload.email,
    location_id: payload.location_id,
    ghl_location_id: payload.ghl_location_id,
    role: payload.role,
    permissions: payload.permissions,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(payload.sub)
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .sign(secretKey());
}

export async function signRefreshToken(
  payload: Pick<SessionPayload, "sub" | "email">,
  expiresIn = "30d",
): Promise<string> {
  return new SignJWT({ email: payload.email, typ: "refresh" })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(payload.sub)
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .sign(secretKey());
}

export async function verifyAccessToken(
  token: string,
): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey());
    if (!payload.sub || typeof payload.email !== "string") return null;
    return {
      sub: payload.sub,
      email: payload.email,
      location_id: String(payload.location_id || ""),
      ghl_location_id: String(payload.ghl_location_id || ""),
      role: String(payload.role || "staff"),
      permissions: (payload.permissions as Permission[]) || [],
    };
  } catch {
    return null;
  }
}
