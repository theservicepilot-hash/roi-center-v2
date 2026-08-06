import { ghlGet } from "@/lib/ghl/http";

const REPORTING_FIELDS =
  "impressions,clicks,spend,cpc,cost_per_conversion,conversions,results,cost_per_result,cpm,reach,frequency,ctr";

export async function fetchFacebookDailyReporting(
  accessToken: string,
  locationId: string,
  startDate: string,
  endDate: string,
) {
  return ghlGet(accessToken, "/ad-publishing/facebook/reporting", {
    locationId,
    fields: REPORTING_FIELDS,
    groupBy: "day",
    startDate,
    endDate,
    type: "INTEGRATION",
  });
}

export async function listFacebookCampaigns(
  accessToken: string,
  locationId: string,
  startDate: string,
  endDate: string,
): Promise<Record<string, unknown>[]> {
  const payload = await ghlGet(
    accessToken,
    "/ad-publishing/facebook/reporting/list",
    {
      locationId,
      listType: "campaigns",
      startDate,
      endDate,
      type: "INTEGRATION",
    },
  );
  if (Array.isArray(payload)) return payload as Record<string, unknown>[];
  if (payload && typeof payload === "object") {
    const obj = payload as Record<string, unknown>;
    for (const key of ["campaigns", "data", "results", "list"]) {
      const v = obj[key];
      if (Array.isArray(v)) return v as Record<string, unknown>[];
    }
  }
  return [];
}
