import { NextRequest } from "next/server";

import {
  Permissions,
  jsonError,
  jsonOk,
  requireAuth,
  requirePerm,
} from "@/lib/auth/request";
import { listCampaigns } from "@/lib/roi/meta-sync";

export async function GET(req: NextRequest) {
  try {
    const ctx = await requireAuth(req);
    requirePerm(ctx, Permissions.REPORT_VIEW);
    const results = await listCampaigns(ctx.location);
    return jsonOk({
      location_id: ctx.location.ghl_location_id,
      count: results.length,
      results,
    });
  } catch (e) {
    return jsonError(e);
  }
}
