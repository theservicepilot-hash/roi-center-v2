import { NextRequest } from "next/server";

import {
  Permissions,
  jsonError,
  jsonOk,
  requireAuth,
  requirePerm,
} from "@/lib/auth/request";
import { listOpportunities } from "@/lib/roi/crm-sync";

export async function GET(req: NextRequest) {
  try {
    const ctx = await requireAuth(req);
    requirePerm(ctx, Permissions.REPORT_VIEW);
    const limitRaw = req.nextUrl.searchParams.get("limit") || "100";
    const limit = Number.parseInt(limitRaw, 10) || 100;
    const results = await listOpportunities(
      ctx.location,
      req.nextUrl.searchParams.get("status") || undefined,
      req.nextUrl.searchParams.get("source") || undefined,
      limit,
    );
    return jsonOk({
      location_id: ctx.location.ghl_location_id,
      count: results.length,
      results,
    });
  } catch (e) {
    return jsonError(e);
  }
}
