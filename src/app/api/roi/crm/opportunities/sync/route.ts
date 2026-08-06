import { NextRequest } from "next/server";

import {
  Permissions,
  jsonError,
  jsonOk,
  requireAuth,
  requirePerm,
} from "@/lib/auth/request";
import { enqueueJob } from "@/lib/jobs/queue";
import { kickJobQueue } from "@/lib/jobs/kick";
import { syncLocationOpportunities } from "@/lib/roi/crm-sync";

export async function POST(req: NextRequest) {
  try {
    const ctx = await requireAuth(req);
    requirePerm(ctx, Permissions.REPORT_MANAGE);
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const asyncMode = ["1", "true", "yes"].includes(
      String(body.async || "").toLowerCase(),
    );
    if (asyncMode) {
      await enqueueJob("crm.sync", { locationId: ctx.location.id });
      kickJobQueue(1);
      return jsonOk({
        queued: true,
        location_id: ctx.location.ghl_location_id,
      });
    }
    return jsonOk(await syncLocationOpportunities(ctx.location));
  } catch (e) {
    return jsonError(e);
  }
}
