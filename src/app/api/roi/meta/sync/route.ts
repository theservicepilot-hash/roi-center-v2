import { NextRequest } from "next/server";

import {
  Permissions,
  jsonError,
  jsonOk,
  parseDateParam,
  requireAuth,
  requirePerm,
} from "@/lib/auth/request";
import { enqueueJob } from "@/lib/jobs/queue";
import { kickJobQueue } from "@/lib/jobs/kick";
import { syncLocationMetaAds } from "@/lib/roi/meta-sync";

export async function POST(req: NextRequest) {
  try {
    const ctx = await requireAuth(req);
    requirePerm(ctx, Permissions.REPORT_MANAGE);
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const asyncMode = ["1", "true", "yes"].includes(
      String(body.async || "").toLowerCase(),
    );
    const start = parseDateParam(
      body.start_date != null ? String(body.start_date) : null,
      "start_date",
    );
    const end = parseDateParam(
      body.end_date != null ? String(body.end_date) : null,
      "end_date",
    );

    if (asyncMode) {
      await enqueueJob("meta.sync", {
        locationId: ctx.location.id,
        startDate: start,
        endDate: end,
      });
      kickJobQueue(1);
      return jsonOk({
        queued: true,
        location_id: ctx.location.ghl_location_id,
      });
    }

    const result = await syncLocationMetaAds(
      ctx.location,
      start || undefined,
      end || undefined,
    );
    return jsonOk(result);
  } catch (e) {
    return jsonError(e);
  }
}
