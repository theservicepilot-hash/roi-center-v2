import { NextRequest } from "next/server";

import {
  Permissions,
  jsonError,
  jsonOk,
  rangeFromRequest,
  requireAuth,
  requirePerm,
} from "@/lib/auth/request";
import { listDailySeries } from "@/lib/roi/meta-sync";

export async function GET(req: NextRequest) {
  try {
    const ctx = await requireAuth(req);
    requirePerm(ctx, Permissions.REPORT_VIEW);
    const { start, end } = rangeFromRequest(req);
    const results = await listDailySeries(ctx.location, start, end);
    return jsonOk({
      location_id: ctx.location.ghl_location_id,
      start_date: start,
      end_date: end,
      results,
    });
  } catch (e) {
    return jsonError(e);
  }
}
