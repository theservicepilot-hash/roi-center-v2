import { NextRequest } from "next/server";

import { getEnv } from "@/lib/env";
import { processJobQueue } from "@/lib/jobs/runner";
import { refreshAllLocationsGoogleAds } from "@/lib/roi/google-sync";
import { refreshAllLocationsMetaAds } from "@/lib/roi/meta-sync";

function authorize(req: NextRequest) {
  const secret = getEnv().CRON_SECRET;
  if (!secret) return true;
  const auth = req.headers.get("authorization") || "";
  return auth === `Bearer ${secret}`;
}

export async function GET(req: NextRequest) {
  if (!authorize(req)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const meta = await refreshAllLocationsMetaAds();
  const google = await refreshAllLocationsGoogleAds();
  const queue = await processJobQueue(2);
  return Response.json({ ok: true, meta, google, queue });
}
