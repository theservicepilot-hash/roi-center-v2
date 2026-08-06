import { NextRequest } from "next/server";

import {
  Permissions,
  jsonError,
  jsonOk,
  rangeFromRequest,
  requireAuth,
  requirePerm,
} from "@/lib/auth/request";
import { summarizeMetaAds } from "@/lib/roi/meta-sync";

export async function GET(req: NextRequest) {
  try {
    const ctx = await requireAuth(req);
    requirePerm(ctx, Permissions.REPORT_VIEW);
    const { start, end } = rangeFromRequest(req);
    const data = await summarizeMetaAds(ctx.location, start, end);
    return jsonOk({ ...data, location_id: ctx.location.ghl_location_id });
  } catch (e) {
    return jsonError(e);
  }
}
