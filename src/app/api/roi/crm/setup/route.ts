import { NextRequest } from "next/server";

import {
  Permissions,
  ApiError,
  jsonError,
  jsonOk,
  requireAuth,
  requirePerm,
} from "@/lib/auth/request";
import { hasPermission } from "@/lib/auth/permissions";
import {
  discoverPipelines,
  getOrCreateCrmSetup,
  saveCrmPipeline,
  serializeCrmSetup,
  syncLocationOpportunities,
} from "@/lib/roi/crm-sync";
import { enqueueJob } from "@/lib/jobs/queue";
import { kickJobQueue } from "@/lib/jobs/kick";

export async function GET(req: NextRequest) {
  try {
    const ctx = await requireAuth(req);
    requirePerm(ctx, Permissions.REPORT_VIEW);
    const discover = !["0", "false", "no"].includes(
      String(req.nextUrl.searchParams.get("discover") ?? "1").toLowerCase(),
    );
    if (discover) {
      return jsonOk(await discoverPipelines(ctx.location));
    }
    const setup = await getOrCreateCrmSetup(ctx.location.id);
    return jsonOk(
      await serializeCrmSetup(setup, ctx.location.ghl_location_id),
    );
  } catch (e) {
    return jsonError(e);
  }
}

export async function POST(req: NextRequest) {
  try {
    const ctx = await requireAuth(req);
    requirePerm(ctx, Permissions.REPORT_VIEW);
    if (!hasPermission(ctx.permissions, Permissions.REPORT_MANAGE)) {
      throw new ApiError(
        "You need report.manage to change CRM setup.",
        403,
        "forbidden",
      );
    }
    const body = (await req.json()) as Record<string, unknown>;
    let data = await saveCrmPipeline(
      ctx.location,
      String(body.pipeline_id || ""),
      String(body.pipeline_name || ""),
    );
    const doSync = !["0", "false", "no"].includes(
      String(body.sync ?? "1").toLowerCase(),
    );
    if (doSync) {
      try {
        await syncLocationOpportunities(ctx.location);
        const setup = await getOrCreateCrmSetup(ctx.location.id);
        data = {
          ...(await serializeCrmSetup(setup, ctx.location.ghl_location_id)),
          synced: true,
        };
      } catch {
        await enqueueJob("crm.sync", { locationId: ctx.location.id });
        kickJobQueue(1);
        data = { ...data, sync_queued: true };
      }
    }
    return jsonOk(data);
  } catch (e) {
    return jsonError(e);
  }
}
