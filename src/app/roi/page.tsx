"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  DollarSign,
  MousePointerClick,
  RefreshCw,
  Target,
  TrendingUp,
  Users,
  Wallet,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { EmptyState } from "@/components/common/EmptyState";
import { PageHeader } from "@/components/common/PageHeader";
import { StatCard } from "@/components/common/StatCard";
import { AppShell } from "@/components/layout/AppShell";
import {
  CombinedSpendChart,
  mergeDailySpend,
} from "@/components/roi/CombinedSpendChart";
import { AdsDailyCharts } from "@/components/roi/MetaDailyCharts";
import { RoiCrmSetupCard } from "@/components/roi/RoiCrmSetupCard";
import { RoiDateRangePicker } from "@/components/roi/RoiDateRangePicker";
import { RoiSetupNotes } from "@/components/roi/RoiSetupNotes";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/features/auth/AuthProvider";
import { api } from "@/lib/api";
import { cn, defaultDateRange, formatDate, money, num } from "@/lib/utils";

type Channel = "overview" | "facebook" | "google";

interface MetaTotals {
  impressions: number;
  clicks: number;
  spend: number;
  conversions: number;
  leads: number;
  ctr: number;
  cpc: number;
  cpm: number;
  cost_per_lead: number;
  cost_per_conversion: number;
}

interface GoogleTotals {
  impressions: number;
  clicks: number;
  spend: number;
  conversions: number;
  ctr: number;
  cpc: number;
  cpm: number;
  cost_per_conversion: number;
}

interface SyncInfo {
  status: string;
  last_synced_at: string | null;
  daily_from: string | null;
  daily_to: string | null;
  last_error: string;
}

interface CrmChannelReturns {
  won_revenue: number;
  won_count: number;
  open_value: number;
  open_count: number;
  lost_value: number;
  lost_count: number;
  abandoned_value: number;
  abandoned_count: number;
  spend: number;
  roas: number | null;
  cost_per_won: number | null;
}

interface CrmReturnsSummary {
  location_id: string;
  start_date: string;
  end_date: string;
  crm: {
    is_configured: boolean;
    pipeline_name: string;
    last_synced_at: string | null;
    opportunities_synced: number;
  };
  overall: CrmChannelReturns;
  facebook: CrmChannelReturns;
  google: CrmChannelReturns;
  other: CrmChannelReturns;
  opportunity_count: number;
}

interface ChannelSummaryBase {
  location_id: string;
  start_date: string;
  end_date: string;
  days_with_data: number;
  expected_days?: number;
  data_through?: string | null;
  totals_source?: "ghl_totals" | "daily_sum";
  totals_aligned?: boolean;
  sync: SyncInfo;
}

interface MetaSummary extends ChannelSummaryBase {
  totals: MetaTotals;
  ghl_totals?: MetaTotals | null;
}

interface GoogleSummary extends ChannelSummaryBase {
  totals: GoogleTotals;
  ghl_totals?: GoogleTotals | null;
}

interface DailyPoint {
  date: string;
  impressions: number;
  clicks: number;
  spend: number;
  conversions: number;
  leads?: number;
}

interface MetaCampaign {
  campaign_id: string;
  ad_account_id: string;
  name: string;
  status: string;
  synced_at: string | null;
}

interface GoogleCampaign {
  campaign_id: string;
  customer_id: string;
  name: string;
  status: string;
  impressions: number;
  clicks: number;
  spend: number;
  conversions: number;
  metrics_start?: string | null;
  metrics_end?: string | null;
  synced_at: string | null;
}

function statusVariant(status: string): "default" | "secondary" | "outline" {
  const s = status.toUpperCase();
  if (s === "ACTIVE" || s === "ENABLED") return "default";
  if (s === "PAUSED") return "secondary";
  return "outline";
}

const PRESETS: { label: string; days: number }[] = [
  { label: "7d", days: 7 },
  { label: "14d", days: 14 },
  { label: "30d", days: 30 },
  { label: "90d", days: 90 },
];

const CHANNELS: { id: Channel; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "facebook", label: "Facebook Ads" },
  { id: "google", label: "Google Ads" },
];

function RoiCenterContent() {
  const { location, hasPermission, loading: authLoading } = useAuth();
  const canSync = hasPermission("report.manage");
  const queryClient = useQueryClient();
  const initial = useMemo(() => defaultDateRange(), []);
  const [channel, setChannel] = useState<Channel>("overview");
  const [startDate, setStartDate] = useState(initial.start);
  const [endDate, setEndDate] = useState(initial.end);
  const [committedStart, setCommittedStart] = useState(initial.start);
  const [committedEnd, setCommittedEnd] = useState(initial.end);
  const [campaignPage, setCampaignPage] = useState(1);
  const CAMPAIGN_PAGE_SIZE = 5;

  const locationKey = location?.ghl_location_id;
  const isOverview = channel === "overview";
  const isFacebook = channel === "facebook";
  const isGoogle = channel === "google";
  const channelApi = isFacebook ? "meta" : isGoogle ? "google" : null;

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setCommittedStart(startDate);
      setCommittedEnd(endDate);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [startDate, endDate]);

  useEffect(() => {
    if (!locationKey) return;
    for (const key of [
      "roi-meta-summary",
      "roi-meta-daily",
      "roi-meta-campaigns",
      "roi-google-summary",
      "roi-google-daily",
      "roi-google-campaigns",
    ]) {
      void queryClient.invalidateQueries({ queryKey: [key] });
    }
  }, [locationKey, queryClient]);

  const rangeParams = {
    start_date: committedStart,
    end_date: committedEnd,
    location_id: locationKey,
  };

  const metaSummaryQuery = useQuery({
    queryKey: ["roi-meta-summary", locationKey, committedStart, committedEnd],
    queryFn: async () => {
      const data = await api.get<MetaSummary>("/roi/meta/summary", { params: rangeParams });
      if (locationKey && data.location_id && data.location_id !== locationKey) {
        throw new Error("Location mismatch — refresh and try again.");
      }
      return data;
    },
    enabled: Boolean(locationKey && committedStart && committedEnd && (isOverview || isFacebook)),
  });

  const googleSummaryQuery = useQuery({
    queryKey: ["roi-google-summary", locationKey, committedStart, committedEnd],
    queryFn: async () => {
      const data = await api.get<GoogleSummary>("/roi/google/summary", { params: rangeParams });
      if (locationKey && data.location_id && data.location_id !== locationKey) {
        throw new Error("Location mismatch — refresh and try again.");
      }
      return data;
    },
    enabled: Boolean(locationKey && committedStart && committedEnd && (isOverview || isGoogle)),
  });

  const metaDailyQuery = useQuery({
    queryKey: ["roi-meta-daily", locationKey, committedStart, committedEnd],
    queryFn: async () => {
      const data = await api.get<{ location_id: string; results: DailyPoint[] }>(
        "/roi/meta/daily",
        { params: rangeParams },
      );
      return data.results;
    },
    enabled: Boolean(locationKey && committedStart && committedEnd && (isOverview || isFacebook)),
  });

  const googleDailyQuery = useQuery({
    queryKey: ["roi-google-daily", locationKey, committedStart, committedEnd],
    queryFn: async () => {
      const data = await api.get<{ location_id: string; results: DailyPoint[] }>(
        "/roi/google/daily",
        { params: rangeParams },
      );
      return data.results;
    },
    enabled: Boolean(locationKey && committedStart && committedEnd && (isOverview || isGoogle)),
  });

  const campaignsQuery = useQuery({
    queryKey: [`roi-${channelApi}-campaigns`, locationKey],
    queryFn: async () => {
      return api.get<{
        location_id: string;
        count: number;
        results: MetaCampaign[] | GoogleCampaign[];
      }>(`/roi/${channelApi}/campaigns`, {
        params: { location_id: locationKey },
      });
    },
    enabled: Boolean(locationKey && channelApi),
  });

  const crmReturnsQuery = useQuery({
    queryKey: ["roi-crm-returns", locationKey, committedStart, committedEnd],
    queryFn: async () => {
      return api.get<CrmReturnsSummary>("/roi/crm/returns", { params: rangeParams });
    },
    enabled: Boolean(locationKey && committedStart && committedEnd),
  });

  const syncMutation = useMutation({
    mutationFn: async (target: "meta" | "google" | "both") => {
      const body = {
        start_date: committedStart,
        end_date: committedEnd,
        location_id: locationKey,
      };
      if (target === "both" || target === "meta") {
        await api.post("/roi/meta/sync", body);
      }
      if (target === "both" || target === "google") {
        await api.post("/roi/google/sync", body);
      }
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["roi-meta-summary", locationKey] }),
        queryClient.invalidateQueries({ queryKey: ["roi-meta-daily", locationKey] }),
        queryClient.invalidateQueries({ queryKey: ["roi-meta-campaigns", locationKey] }),
        queryClient.invalidateQueries({ queryKey: ["roi-google-summary", locationKey] }),
        queryClient.invalidateQueries({ queryKey: ["roi-google-daily", locationKey] }),
        queryClient.invalidateQueries({ queryKey: ["roi-google-campaigns", locationKey] }),
        queryClient.invalidateQueries({ queryKey: ["roi-crm-returns", locationKey] }),
      ]);
    },
  });

  useEffect(() => {
    setCampaignPage(1);
  }, [locationKey, channel, campaignsQuery.data?.count]);

  const metaSummary = metaSummaryQuery.data;
  const googleSummary = googleSummaryQuery.data;
  const crmReturns = crmReturnsQuery.data;
  const crmBucket = isFacebook
    ? crmReturns?.facebook
    : isGoogle
      ? crmReturns?.google
      : crmReturns?.overall;
  const metaTotals = metaSummary?.totals;
  const googleTotals = googleSummary?.totals;
  const activeSummary = isFacebook ? metaSummary : isGoogle ? googleSummary : undefined;
  const activeSync = activeSummary?.sync;
  const daily = isFacebook
    ? (metaDailyQuery.data ?? [])
    : isGoogle
      ? (googleDailyQuery.data ?? [])
      : [];

  const combinedSeries = useMemo(
    () => mergeDailySpend(metaDailyQuery.data ?? [], googleDailyQuery.data ?? []),
    [metaDailyQuery.data, googleDailyQuery.data],
  );

  const combinedSpend = (metaTotals?.spend ?? 0) + (googleTotals?.spend ?? 0);
  const combinedClicks = (metaTotals?.clicks ?? 0) + (googleTotals?.clicks ?? 0);
  const combinedImpressions =
    (metaTotals?.impressions ?? 0) + (googleTotals?.impressions ?? 0);
  const fbShare =
    combinedSpend > 0 ? ((metaTotals?.spend ?? 0) / combinedSpend) * 100 : 0;
  const ggShare =
    combinedSpend > 0 ? ((googleTotals?.spend ?? 0) / combinedSpend) * 100 : 0;

  const showChannelLoading =
    (isFacebook && (metaSummaryQuery.isFetching || !metaSummaryQuery.data)) ||
    (isGoogle && (googleSummaryQuery.isFetching || !googleSummaryQuery.data));
  const showOverviewLoading =
    isOverview &&
    ((metaSummaryQuery.isFetching && !metaSummaryQuery.data) ||
      (googleSummaryQuery.isFetching && !googleSummaryQuery.data));

  const expected = activeSummary?.expected_days ?? 0;
  const daysWithData = activeSummary?.days_with_data ?? 0;
  const rangeLooksIncomplete =
    Boolean(activeSummary) &&
    (daysWithData === 0 || (expected >= 3 && daysWithData < Math.ceil(expected * 0.5)));

  const allCampaigns = campaignsQuery.data?.results ?? [];
  const campaignTotal = allCampaigns.length;
  const campaignPageCount = Math.max(1, Math.ceil(campaignTotal / CAMPAIGN_PAGE_SIZE));
  const safeCampaignPage = Math.min(campaignPage, campaignPageCount);
  const pagedCampaigns = allCampaigns.slice(
    (safeCampaignPage - 1) * CAMPAIGN_PAGE_SIZE,
    safeCampaignPage * CAMPAIGN_PAGE_SIZE,
  );
  const campaignFrom =
    campaignTotal === 0 ? 0 : (safeCampaignPage - 1) * CAMPAIGN_PAGE_SIZE + 1;
  const campaignTo = Math.min(safeCampaignPage * CAMPAIGN_PAGE_SIZE, campaignTotal);

  const channelLabel = isFacebook ? "Facebook" : isGoogle ? "Google" : "Paid media";
  const syncTarget: "meta" | "google" | "both" = isOverview
    ? "both"
    : isFacebook
      ? "meta"
      : "google";

  if (authLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-28 w-full rounded-xl" />
        <Skeleton className="h-28 w-full rounded-xl" />
      </div>
    );
  }

  if (!location) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="ROI Center"
          description="Facebook and Google ads performance for your location."
        />
        <EmptyState
          icon={TrendingUp}
          title="Select a location"
          description="Open ROI Center from a GoHighLevel custom menu link or complete OAuth install."
        />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <PageHeader
        title="ROI Center"
        description={
          isOverview
            ? `Combined paid media for ${location.name || location.ghl_location_id}. Sync pulls both channels for this date range.`
            : `${channelLabel} ads for ${location.name || location.ghl_location_id}. Totals come from stored daily data — Sync pulls this range from GoHighLevel.`
        }
        actions={
          <Button
            variant="outline"
            loading={syncMutation.isPending}
            disabled={!canSync || syncMutation.isPending}
            onClick={() => syncMutation.mutate(syncTarget)}
          >
            <RefreshCw className="size-4" />
            {isOverview ? "Sync both" : "Sync now"}
          </Button>
        }
      />

      <div className="flex flex-wrap gap-2 border-b border-border pb-3">
        {CHANNELS.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => setChannel(c.id)}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
              channel === c.id
                ? "bg-foreground text-background"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            {c.label}
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <RoiDateRangePicker
          startDate={startDate}
          endDate={endDate}
          presets={PRESETS}
          onChange={(start, end) => {
            setStartDate(start);
            setEndDate(end);
          }}
        />
        <p className="text-xs text-muted-foreground">
          {syncMutation.isPending
            ? isOverview
              ? "Syncing Facebook + Google from GoHighLevel…"
              : `Syncing ${channelLabel} from GoHighLevel…`
            : isOverview
              ? metaSummary?.sync.last_synced_at || googleSummary?.sync.last_synced_at
                ? `Last channel sync ${formatDate(
                    metaSummary?.sync.last_synced_at ||
                      googleSummary?.sync.last_synced_at ||
                      "",
                  )}`
                : "Not synced yet — run Sync both"
              : activeSync?.last_synced_at
                ? `Last synced ${formatDate(activeSync.last_synced_at)}${
                    activeSummary?.totals_source === "daily_sum"
                      ? " · KPIs match charts"
                      : ""
                  }`
                : "Not synced yet — run Sync now"}
          {!isOverview && activeSync?.status === "error" && activeSync.last_error
            ? ` · ${activeSync.last_error}`
            : null}
        </p>
      </div>

      {!isOverview && rangeLooksIncomplete ? (
        <p className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
          This date range looks incomplete in our database
          {expected ? ` (${daysWithData} of ~${expected} days)` : ""}. Click{" "}
          <span className="font-medium text-foreground">Sync now</span> to pull from GoHighLevel.
        </p>
      ) : null}

      {!isOverview && activeSummary?.totals_aligned === false && activeSummary.ghl_totals ? (
        <p className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
          Chart KPIs use daily row sums ({money(activeSummary.totals.spend)}). GHL range total was{" "}
          {money(activeSummary.ghl_totals.spend)} — re-sync this exact range if you need the GHL card
          figure stored as a snapshot.
        </p>
      ) : null}

      {!canSync ? (
        <p className="text-xs text-muted-foreground">
          You can view reports; sync requires report.manage.
        </p>
      ) : null}

      {syncMutation.isError ? (
        <p className="text-sm text-destructive">
          Sync failed. Check that this location has a valid GHL token and Ad Publishing
          connected (Facebook / Google) with Ad Publishing scopes.
        </p>
      ) : null}

      <RoiSetupNotes />

      <RoiCrmSetupCard locationKey={locationKey} />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {crmReturnsQuery.isFetching && !crmReturns ? (
          Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))
        ) : (
          <>
            <StatCard
              label={isOverview ? "Won revenue" : `${channelLabel} won revenue`}
              value={money(crmBucket?.won_revenue ?? 0)}
              icon={Wallet}
              hint={
                crmReturns?.crm?.is_configured
                  ? `${crmBucket?.won_count ?? 0} won opps`
                  : "Configure CRM pipeline"
              }
            />
            <StatCard
              label={isOverview ? "ROAS" : `${channelLabel} ROAS`}
              value={
                crmBucket?.roas == null ? "—" : `${Number(crmBucket.roas).toFixed(2)}x`
              }
              icon={Target}
              hint="Won revenue ÷ ad spend"
            />
            <StatCard
              label="Open pipeline"
              value={money(crmBucket?.open_value ?? 0)}
              icon={TrendingUp}
              hint={`${crmBucket?.open_count ?? 0} open`}
            />
            <StatCard
              label="Lost + abandoned"
              value={money(
                (crmBucket?.lost_value ?? 0) + (crmBucket?.abandoned_value ?? 0),
              )}
              icon={Users}
              hint={`${(crmBucket?.lost_count ?? 0) + (crmBucket?.abandoned_count ?? 0)} closed out`}
            />
          </>
        )}
      </div>

      {isOverview ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {showOverviewLoading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-28 rounded-xl" />
              ))
            ) : (
              <>
                <StatCard
                  label="Combined spend"
                  value={money(combinedSpend)}
                  icon={DollarSign}
                  hint="Facebook + Google"
                />
                <StatCard
                  label="Impressions"
                  value={num(combinedImpressions)}
                  icon={TrendingUp}
                  hint="Both channels"
                />
                <StatCard
                  label="Clicks"
                  value={num(combinedClicks)}
                  icon={MousePointerClick}
                  hint="Both channels"
                />
                <StatCard
                  label="Spend mix"
                  value={`${fbShare.toFixed(0)}% / ${ggShare.toFixed(0)}%`}
                  icon={Target}
                  hint="Facebook / Google"
                />
              </>
            )}
          </div>

          <CombinedSpendChart
            data={combinedSeries}
            loading={
              (metaDailyQuery.isFetching && !metaDailyQuery.data) ||
              (googleDailyQuery.isFetching && !googleDailyQuery.data)
            }
          />

          <div className="grid gap-4 lg:grid-cols-2">
            <button
              type="button"
              onClick={() => setChannel("facebook")}
              className="group text-left transition-transform hover:-translate-y-0.5"
            >
              <Card className="h-full border-border/80 transition-shadow group-hover:shadow-md">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between gap-3">
                    <CardTitle className="text-base">Facebook Ads</CardTitle>
                    <Badge variant="secondary" className="font-normal">
                      Open report
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">Meta performance for this range</p>
                </CardHeader>
                <CardContent className="grid grid-cols-3 gap-3">
                  {metaSummaryQuery.isFetching && !metaSummary ? (
                    Array.from({ length: 3 }).map((_, i) => (
                      <Skeleton key={i} className="h-14 rounded-lg" />
                    ))
                  ) : (
                    <>
                      <div>
                        <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                          Spend
                        </p>
                        <p className="mt-1 text-lg font-semibold tabular-nums">
                          {money(metaTotals?.spend ?? 0)}
                        </p>
                      </div>
                      <div>
                        <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                          Leads
                        </p>
                        <p className="mt-1 text-lg font-semibold tabular-nums">
                          {num(metaTotals?.leads ?? 0)}
                        </p>
                      </div>
                      <div>
                        <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                          CPC
                        </p>
                        <p className="mt-1 text-lg font-semibold tabular-nums">
                          {money(metaTotals?.cpc ?? 0)}
                        </p>
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>
            </button>

            <button
              type="button"
              onClick={() => setChannel("google")}
              className="group text-left transition-transform hover:-translate-y-0.5"
            >
              <Card className="h-full border-border/80 transition-shadow group-hover:shadow-md">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between gap-3">
                    <CardTitle className="text-base">Google Ads</CardTitle>
                    <Badge variant="secondary" className="font-normal">
                      Open report
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Search & LSA performance for this range
                  </p>
                </CardHeader>
                <CardContent className="grid grid-cols-3 gap-3">
                  {googleSummaryQuery.isFetching && !googleSummary ? (
                    Array.from({ length: 3 }).map((_, i) => (
                      <Skeleton key={i} className="h-14 rounded-lg" />
                    ))
                  ) : (
                    <>
                      <div>
                        <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                          Spend
                        </p>
                        <p className="mt-1 text-lg font-semibold tabular-nums">
                          {money(googleTotals?.spend ?? 0)}
                        </p>
                      </div>
                      <div>
                        <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                          Conv.
                        </p>
                        <p className="mt-1 text-lg font-semibold tabular-nums">
                          {num(googleTotals?.conversions ?? 0)}
                        </p>
                      </div>
                      <div>
                        <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                          CPC
                        </p>
                        <p className="mt-1 text-lg font-semibold tabular-nums">
                          {money(googleTotals?.cpc ?? 0)}
                        </p>
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>
            </button>
          </div>
        </>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            {showChannelLoading ? (
              Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-28 rounded-xl" />
              ))
            ) : isFacebook ? (
              <>
                <StatCard
                  label="Spend"
                  value={money(metaTotals?.spend ?? 0)}
                  icon={DollarSign}
                  hint="Selected range"
                />
                <StatCard
                  label="Impressions"
                  value={num(metaTotals?.impressions ?? 0)}
                  icon={TrendingUp}
                />
                <StatCard
                  label="Clicks"
                  value={num(metaTotals?.clicks ?? 0)}
                  icon={MousePointerClick}
                />
                <StatCard
                  label="Leads"
                  value={num(metaTotals?.leads ?? 0)}
                  icon={Users}
                  hint="Meta lead results"
                />
                <StatCard label="CPC" value={money(metaTotals?.cpc ?? 0)} icon={Target} />
                <StatCard
                  label="Cost / lead"
                  value={money(metaTotals?.cost_per_lead ?? 0)}
                  icon={DollarSign}
                  hint={`CTR ${(metaTotals?.ctr ?? 0).toFixed(2)}%`}
                />
              </>
            ) : (
              <>
                <StatCard
                  label="Spend"
                  value={money(googleTotals?.spend ?? 0)}
                  icon={DollarSign}
                  hint="Selected range"
                />
                <StatCard
                  label="Impressions"
                  value={num(googleTotals?.impressions ?? 0)}
                  icon={TrendingUp}
                />
                <StatCard
                  label="Clicks"
                  value={num(googleTotals?.clicks ?? 0)}
                  icon={MousePointerClick}
                />
                <StatCard
                  label="Conversions"
                  value={num(googleTotals?.conversions ?? 0)}
                  icon={Target}
                  hint="Google Ads conversions"
                />
                <StatCard label="CPC" value={money(googleTotals?.cpc ?? 0)} icon={DollarSign} />
                <StatCard
                  label="Cost / conv"
                  value={money(googleTotals?.cost_per_conversion ?? 0)}
                  icon={DollarSign}
                  hint={`CTR ${(googleTotals?.ctr ?? 0).toFixed(2)}%`}
                />
              </>
            )}
          </div>

          <AdsDailyCharts
            data={daily}
            loading={
              isFacebook
                ? metaDailyQuery.isFetching && !metaDailyQuery.data
                : googleDailyQuery.isFetching && !googleDailyQuery.data
            }
            conversionsHint={isFacebook ? "Meta conversions" : "Google conversions"}
            emptyHint={`No daily series for this range yet. Sync ${channelLabel} ads to populate charts.`}
            rangeTotals={
              isFacebook
                ? {
                    spend: metaTotals?.spend,
                    impressions: metaTotals?.impressions,
                    clicks: metaTotals?.clicks,
                    conversions: metaTotals?.conversions,
                  }
                : {
                    spend: googleTotals?.spend,
                    impressions: googleTotals?.impressions,
                    clicks: googleTotals?.clicks,
                    conversions: googleTotals?.conversions,
                  }
            }
          />

          <Card>
            <CardHeader>
              <CardTitle>Range snapshot</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <div>
                  <p className="text-xs text-muted-foreground">Conversions</p>
                  <p className="mt-1 text-lg font-semibold tabular-nums">
                    {num(
                      isFacebook
                        ? (metaTotals?.conversions ?? 0)
                        : (googleTotals?.conversions ?? 0),
                    )}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">CPM</p>
                  <p className="mt-1 text-lg font-semibold tabular-nums">
                    {money(isFacebook ? (metaTotals?.cpm ?? 0) : (googleTotals?.cpm ?? 0))}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Cost / conversion</p>
                  <p className="mt-1 text-lg font-semibold tabular-nums">
                    {money(
                      isFacebook
                        ? (metaTotals?.cost_per_conversion ?? 0)
                        : (googleTotals?.cost_per_conversion ?? 0),
                    )}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Days with data</p>
                  <p className="mt-1 text-lg font-semibold tabular-nums">
                    {activeSummary?.days_with_data ?? 0}
                    {activeSummary?.expected_days ? (
                      <span className="text-sm font-normal text-muted-foreground">
                        {" "}
                        / {activeSummary.expected_days}
                      </span>
                    ) : null}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <div>
                <CardTitle>Campaigns</CardTitle>
                {isFacebook ? (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Catalog from GHL — Facebook list has no spend metrics
                  </p>
                ) : null}
              </div>
              <Badge variant="secondary" className="font-normal">
                {campaignTotal} total
              </Badge>
            </CardHeader>
            <CardContent>
              {campaignsQuery.isFetching && !campaignsQuery.data ? (
                <div className="space-y-3">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Skeleton key={i} className="h-10 w-full" />
                  ))}
                </div>
              ) : campaignTotal > 0 ? (
                <div className="space-y-4">
                  <div className="overflow-x-auto">
                    {isFacebook ? (
                      <table className="w-full min-w-[640px] text-left text-sm">
                        <thead>
                          <tr className="border-b border-border text-xs uppercase tracking-wide text-muted-foreground">
                            <th className="pb-2 pr-4 font-medium">Campaign</th>
                            <th className="pb-2 pr-4 font-medium">Status</th>
                            <th className="pb-2 font-medium">Campaign ID</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                          {(pagedCampaigns as MetaCampaign[]).map((c) => (
                            <tr key={c.campaign_id}>
                              <td className="max-w-[420px] truncate py-3 pr-4 font-medium text-foreground">
                                {c.name || "—"}
                              </td>
                              <td className="py-3 pr-4">
                                <Badge variant={statusVariant(c.status)}>{c.status || "—"}</Badge>
                              </td>
                              <td className="py-3 font-mono text-xs text-muted-foreground">
                                {c.campaign_id}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    ) : (
                      <table className="w-full min-w-[800px] text-left text-sm">
                        <thead>
                          <tr className="border-b border-border text-xs uppercase tracking-wide text-muted-foreground">
                            <th className="pb-2 pr-4 font-medium">Campaign</th>
                            <th className="pb-2 pr-4 font-medium">Status</th>
                            <th className="pb-2 pr-4 font-medium text-right">Spend</th>
                            <th className="pb-2 pr-4 font-medium text-right">Clicks</th>
                            <th className="pb-2 pr-4 font-medium text-right">Conv.</th>
                            <th className="pb-2 font-medium">Campaign ID</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                          {(pagedCampaigns as GoogleCampaign[]).map((c) => (
                            <tr key={c.campaign_id}>
                              <td className="max-w-[320px] truncate py-3 pr-4 font-medium text-foreground">
                                {c.name || "—"}
                              </td>
                              <td className="py-3 pr-4">
                                <Badge variant={statusVariant(c.status)}>{c.status || "—"}</Badge>
                              </td>
                              <td className="py-3 pr-4 text-right tabular-nums">{money(c.spend)}</td>
                              <td className="py-3 pr-4 text-right tabular-nums">{num(c.clicks)}</td>
                              <td className="py-3 pr-4 text-right tabular-nums">
                                {num(c.conversions)}
                              </td>
                              <td className="py-3 font-mono text-xs text-muted-foreground">
                                {c.campaign_id}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                  {!isFacebook && (pagedCampaigns as GoogleCampaign[])[0]?.metrics_start ? (
                    <p className="text-xs text-muted-foreground">
                      Campaign metrics from last sync range:{" "}
                      {(pagedCampaigns as GoogleCampaign[])[0]?.metrics_start} →{" "}
                      {(pagedCampaigns as GoogleCampaign[])[0]?.metrics_end}
                    </p>
                  ) : null}
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-xs text-muted-foreground">
                      Showing {campaignFrom}–{campaignTo} of {campaignTotal}
                    </p>
                    <div className="flex items-center gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={safeCampaignPage <= 1}
                        onClick={() => setCampaignPage((p) => Math.max(1, p - 1))}
                      >
                        Previous
                      </Button>
                      <span className="text-xs tabular-nums text-muted-foreground">
                        Page {safeCampaignPage} / {campaignPageCount}
                      </span>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={safeCampaignPage >= campaignPageCount}
                        onClick={() =>
                          setCampaignPage((p) => Math.min(campaignPageCount, p + 1))
                        }
                      >
                        Next
                      </Button>
                    </div>
                  </div>
                </div>
              ) : (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  No campaigns for this location yet. Sync to pull the {channelLabel} list from GHL.
                </p>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

export default function RoiPage() {
  return (
    <AppShell>
      <RoiCenterContent />
    </AppShell>
  );
}
