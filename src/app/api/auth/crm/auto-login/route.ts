import { timingSafeEqual } from "crypto";

import { NextRequest } from "next/server";

import { ApiError, jsonError, jsonOk } from "@/lib/auth/request";
import { ghlConfig } from "@/lib/env";
import {
  ensureMembership,
  issueSessionForMembership,
  upsertUser,
} from "@/lib/tenancy/provisioning";
import { supabaseAdmin } from "@/lib/supabase/admin";

function secretsMatch(a: string, b: string): boolean {
  if (!a || !b) return false;
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      email?: string;
      location_id?: string;
      locationId?: string;
      shared_secret?: string;
    };

    const cfg = ghlConfig();
    if (cfg.autologinSecret) {
      const sig =
        req.headers.get("x-ghl-signature") || body.shared_secret || "";
      if (!secretsMatch(sig, cfg.autologinSecret)) {
        throw new ApiError("Invalid auto-login signature", 401, "forbidden");
      }
    }

    const email = String(body.email || "")
      .trim()
      .toLowerCase();
    const ghlLoc = String(body.location_id || body.locationId || "").trim();
    if (!email || !ghlLoc) {
      throw new ApiError("email and location_id required", 400);
    }

    const db = supabaseAdmin();
    const { data: location } = await db
      .from("locations")
      .select("*")
      .eq("ghl_location_id", ghlLoc)
      .eq("is_active", true)
      .maybeSingle();

    if (!location) {
      throw new ApiError("Location not installed", 404, "location_not_found");
    }

    const user = await upsertUser({ email });
    await ensureMembership(user.id, location.id, "staff");

    const { data: membership } = await db
      .from("memberships")
      .select("role")
      .eq("user_id", user.id)
      .eq("location_id", location.id)
      .single();

    const session = await issueSessionForMembership(
      user,
      location,
      membership?.role || "staff",
    );
    return jsonOk(session);
  } catch (e) {
    return jsonError(e);
  }
}
