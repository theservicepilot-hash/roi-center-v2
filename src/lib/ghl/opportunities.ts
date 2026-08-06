import { ghlGet } from "@/lib/ghl/http";
import { GhlApiError } from "@/lib/ghl/http";
import { ghlConfig } from "@/lib/env";

const OPP_VERSION = "2021-07-28";

export interface GhlPipeline {
  id: string;
  name: string;
  stages: { id: string; name: string }[];
}

export async function fetchPipelines(
  accessToken: string,
  locationId: string,
): Promise<GhlPipeline[]> {
  const payload = await ghlGet(
    accessToken,
    "/opportunities/pipelines",
    { locationId },
    OPP_VERSION,
  );
  let rows: unknown[] = [];
  if (Array.isArray(payload)) rows = payload;
  else if (payload && typeof payload === "object") {
    const o = payload as Record<string, unknown>;
    rows = (o.pipelines || o.data || o.results || []) as unknown[];
  }
  const out: GhlPipeline[] = [];
  for (const item of rows) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const pid = String(row.id || row._id || "").trim();
    if (!pid) continue;
    const stages: GhlPipeline["stages"] = [];
    for (const stage of (row.stages as unknown[]) || []) {
      if (!stage || typeof stage !== "object") continue;
      const s = stage as Record<string, unknown>;
      const sid = String(s.id || s._id || "").trim();
      if (!sid) continue;
      stages.push({
        id: sid,
        name: String(s.name || s.title || sid),
      });
    }
    out.push({
      id: pid,
      name: String(row.name || row.title || pid).trim(),
      stages,
    });
  }
  return out;
}

export async function searchOpportunities(
  accessToken: string,
  locationId: string,
  pipelineId?: string,
  maxPages = 50,
  limit = 100,
): Promise<Record<string, unknown>[]> {
  const cfg = ghlConfig();
  const rows: Record<string, unknown>[] = [];
  let nextUrl: string | null = `${cfg.apiBaseUrl}/opportunities/search`;
  let page = 1;

  while (nextUrl && page <= maxPages) {
    let url = nextUrl;
    if (page === 1) {
      const u = new URL(nextUrl);
      u.searchParams.set("location_id", locationId);
      u.searchParams.set("limit", String(limit));
      if (pipelineId) u.searchParams.set("pipeline_id", pipelineId);
      url = u.toString();
    }

    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Version: OPP_VERSION,
        Accept: "application/json",
      },
      cache: "no-store",
    });
    if (res.status >= 400) {
      const body = (await res.text()).slice(0, 400);
      throw new GhlApiError(
        "GoHighLevel could not search opportunities.",
        "ghl_opportunities_error",
        { status: res.status, body },
      );
    }
    const payload = (await res.json()) as Record<string, unknown>;
    const batch = (payload.opportunities ||
      payload.data ||
      payload.results ||
      []) as unknown[];
    if (Array.isArray(batch)) {
      for (const item of batch) {
        if (item && typeof item === "object") {
          rows.push(item as Record<string, unknown>);
        }
      }
    }

    const meta = (payload.meta as Record<string, unknown>) || {};
    const nextPageUrl = meta.nextPageUrl as string | undefined;
    if (nextPageUrl) {
      nextUrl = nextPageUrl.startsWith("/")
        ? `${cfg.apiBaseUrl}${nextPageUrl}`
        : nextPageUrl;
      page += 1;
      continue;
    }
    const startAfter = meta.startAfter;
    const startAfterId = meta.startAfterId;
    if (startAfter && startAfterId && batch.length) {
      const q = new URLSearchParams({
        location_id: locationId,
        limit: String(limit),
        startAfter: String(startAfter),
        startAfterId: String(startAfterId),
      });
      if (pipelineId) q.set("pipeline_id", pipelineId);
      nextUrl = `${cfg.apiBaseUrl}/opportunities/search?${q}`;
      page += 1;
      continue;
    }
    break;
  }
  return rows;
}
