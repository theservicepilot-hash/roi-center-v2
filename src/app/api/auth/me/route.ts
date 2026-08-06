import { NextRequest } from "next/server";

import { jsonError, jsonOk, requireAuth } from "@/lib/auth/request";

export async function GET(req: NextRequest) {
  try {
    const ctx = await requireAuth(req);
    return jsonOk({
      user: { id: ctx.session.sub, email: ctx.session.email },
      location: {
        id: ctx.location.id,
        ghl_location_id: ctx.location.ghl_location_id,
        name: ctx.location.name,
      },
      role: ctx.session.role,
      permissions: ctx.permissions,
    });
  } catch (e) {
    return jsonError(e);
  }
}
