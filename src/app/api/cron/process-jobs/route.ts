import { NextRequest } from "next/server";

import { getEnv } from "@/lib/env";
import { processJobQueue } from "@/lib/jobs/runner";

function authorize(req: NextRequest) {
  const secret = getEnv().CRON_SECRET;
  if (!secret) return true;
  const auth = req.headers.get("authorization") || "";
  return auth === `Bearer ${secret}`;
}

/** Drain DB job queue (onboard backfill, async syncs). */
export async function GET(req: NextRequest) {
  if (!authorize(req)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const limitRaw = req.nextUrl.searchParams.get("limit");
  const limit = Math.min(Number(limitRaw) || 3, 5);
  const result = await processJobQueue(limit);
  return Response.json({ ok: true, ...result });
}
