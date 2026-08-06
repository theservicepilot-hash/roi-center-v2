import { NextRequest } from "next/server";

import {
  Permissions,
  jsonError,
  jsonOk,
  rangeFromRequest,
  requireAuth,
  requirePerm,
} from "@/lib/auth/request";
import { summarizeCrmReturns } from "@/lib/roi/crm-sync";

export async function GET(req: NextRequest) {
  try {
    const ctx = await requireAuth(req);
    requirePerm(ctx, Permissions.REPORT_VIEW);
    const { start, end } = rangeFromRequest(req);
    return jsonOk(await summarizeCrmReturns(ctx.location, start, end));
  } catch (e) {
    return jsonError(e);
  }
}
