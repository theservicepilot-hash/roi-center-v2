import {
  claimPendingJobs,
  completeJob,
  failJob,
  type BackgroundJob,
} from "@/lib/jobs/queue";
import {
  loadLocationByGhlId,
  loadLocationWithAgency,
  refreshAllTokens,
} from "@/lib/ghl/token-refresh";
import { syncLocationOpportunities } from "@/lib/roi/crm-sync";
import {
  ONBOARD_LOOKBACK_DAYS as GOOGLE_ONBOARD,
  refreshAllLocationsGoogleAds,
  syncLocationGoogleAds,
  syncLocationGoogleAdsLookback,
} from "@/lib/roi/google-sync";
import {
  ONBOARD_LOOKBACK_DAYS as META_ONBOARD,
  refreshAllLocationsMetaAds,
  syncLocationMetaAds,
  syncLocationMetaAdsLookback,
} from "@/lib/roi/meta-sync";

async function runOne(job: BackgroundJob): Promise<Record<string, unknown>> {
  const p = job.payload || {};

  switch (job.job_type) {
    case "meta.sync": {
      const location = await loadLocationWithAgency(String(p.locationId || ""));
      if (!location) return { error: "location_not_found" };
      return syncLocationMetaAds(
        location,
        p.startDate ? String(p.startDate).slice(0, 10) : undefined,
        p.endDate ? String(p.endDate).slice(0, 10) : undefined,
      );
    }
    case "meta.onboard": {
      const ghlId = String(p.ghlLocationId || "").trim();
      const location = await loadLocationByGhlId(ghlId);
      if (!location) return { error: "location_not_found", location_id: ghlId };
      return syncLocationMetaAdsLookback(
        location,
        Number(p.lookbackDays) || META_ONBOARD,
      );
    }
    case "google.sync": {
      const location = await loadLocationWithAgency(String(p.locationId || ""));
      if (!location) return { error: "location_not_found" };
      return syncLocationGoogleAds(
        location,
        p.startDate ? String(p.startDate).slice(0, 10) : undefined,
        p.endDate ? String(p.endDate).slice(0, 10) : undefined,
      );
    }
    case "google.onboard": {
      const ghlId = String(p.ghlLocationId || "").trim();
      const location = await loadLocationByGhlId(ghlId);
      if (!location) return { error: "location_not_found", location_id: ghlId };
      return syncLocationGoogleAdsLookback(
        location,
        Number(p.lookbackDays) || GOOGLE_ONBOARD,
      );
    }
    case "crm.sync": {
      const location = await loadLocationWithAgency(String(p.locationId || ""));
      if (!location) return { error: "location_not_found" };
      return syncLocationOpportunities(location);
    }
    case "ads.refresh_all": {
      const meta = await refreshAllLocationsMetaAds();
      const google = await refreshAllLocationsGoogleAds();
      return { meta, google };
    }
    case "tokens.refresh_all":
      return refreshAllTokens();
    default:
      return { error: `unknown_job_type:${job.job_type}` };
  }
}

/** Drain a few pending jobs. Safe to call from cron or after(). */
export async function processJobQueue(limit = 2): Promise<{
  processed: number;
  results: Array<{ id: string; ok: boolean; result?: unknown }>;
}> {
  const jobs = await claimPendingJobs(limit);
  const results: Array<{ id: string; ok: boolean; result?: unknown }> = [];

  for (const job of jobs) {
    try {
      const result = await runOne(job);
      if (result && typeof result === "object" && "error" in result && result.error) {
        await failJob(job.id, result.error, job.attempts, job.max_attempts);
        results.push({ id: job.id, ok: false, result });
      } else {
        await completeJob(job.id, result as Record<string, unknown>);
        results.push({ id: job.id, ok: true, result });
      }
    } catch (err) {
      console.error("job failed", job.id, job.job_type, err);
      await failJob(job.id, err, job.attempts, job.max_attempts);
      results.push({
        id: job.id,
        ok: false,
        result: { error: err instanceof Error ? err.message : String(err) },
      });
    }
  }

  return { processed: jobs.length, results };
}
