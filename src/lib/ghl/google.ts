import { ghlGet } from "@/lib/ghl/http";

const REPORTING_FIELDS =
  "impressions,clicks,cost_micros,average_cpc,conversions,average_cpm,cost_per_conversion,ctr";

export async function fetchGoogleDailyReporting(
  accessToken: string,
  locationId: string,
  startDate: string,
  endDate: string,
) {
  return ghlGet(accessToken, "/ad-publishing/google/reporting", {
    locationId,
    fields: REPORTING_FIELDS,
    groupBy: "date",
    startDate,
    endDate,
    type: "INTEGRATION",
  });
}

export async function listGoogleCampaignsApi(
  accessToken: string,
  locationId: string,
  startDate: string,
  endDate: string,
): Promise<Record<string, unknown>[]> {
  const payload = await ghlGet(
    accessToken,
    "/ad-publishing/google/reporting/list",
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
    for (const key of ["campaigns", "data", "results", "list", "grouped"]) {
      const v = obj[key];
      if (Array.isArray(v)) return v as Record<string, unknown>[];
    }
  }
  return [];
}
