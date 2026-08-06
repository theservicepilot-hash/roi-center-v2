"use client";

import { useId, useMemo } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from "recharts";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn, formatDate } from "@/lib/utils";

export interface DailyChartPoint {
  date: string;
  impressions: number;
  clicks: number;
  spend: number;
  conversions: number;
  leads?: number;
}

type MetricKey = "spend" | "impressions" | "clicks" | "conversions";

interface MetricConfig {
  key: MetricKey;
  label: string;
  color: string;
  format: (n: number) => string;
  hint: string;
}

function money(n: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(n || 0);
}

function num(n: number): string {
  return new Intl.NumberFormat("en-US").format(n || 0);
}

function buildMetrics(conversionsHint: string): MetricConfig[] {
  return [
    {
      key: "impressions",
      label: "Impressions",
      color: "#0284c7",
      format: num,
      hint: "Daily reach volume",
    },
    {
      key: "clicks",
      label: "Clicks",
      color: "#059669",
      format: num,
      hint: "Link & ad clicks",
    },
    {
      key: "conversions",
      label: "Conversions",
      color: "#d97706",
      format: num,
      hint: conversionsHint,
    },
    {
      key: "spend",
      label: "Spend",
      color: "#0f766e",
      format: money,
      hint: "Ad spend by day",
    },
  ];
}

function shortDate(value: string): string {
  try {
    return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(
      new Date(`${value}T12:00:00`),
    );
  } catch {
    return value;
  }
}

function ChartTooltip({
  active,
  payload,
  label,
  format,
  metricLabel,
}: {
  active?: boolean;
  payload?: Array<{ value?: number }>;
  label?: string;
  format: (n: number) => string;
  metricLabel: string;
}) {
  if (!active || !payload?.length || !label) return null;
  const value = Number(payload[0]?.value ?? 0);
  return (
    <div className="rounded-lg border border-border/70 bg-popover px-3 py-2 shadow-lg">
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {formatDate(label)}
      </p>
      <p className="mt-1 text-sm font-semibold tabular-nums text-foreground">
        {metricLabel}: {format(value)}
      </p>
    </div>
  );
}

function MetricAreaChart({
  data,
  metric,
  total,
}: {
  data: DailyChartPoint[];
  metric: MetricConfig;
  total: number;
}) {
  const gid = useId().replace(/:/g, "");
  const gradientId = `fill-${metric.key}-${gid}`;

  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base">{metric.label}</CardTitle>
            <p className="mt-0.5 text-xs text-muted-foreground">{metric.hint}</p>
          </div>
          <div className="text-right">
            <p className="text-lg font-semibold tabular-nums tracking-tight text-foreground">
              {metric.format(total)}
            </p>
            <p className="text-[11px] text-muted-foreground">Range total</p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pb-4 pt-0">
        <div className="h-[160px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 8, right: 4, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={metric.color} stopOpacity={0.35} />
                  <stop offset="100%" stopColor={metric.color} stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid
                strokeDasharray="3 6"
                vertical={false}
                stroke="hsl(var(--border))"
                opacity={0.8}
              />
              <XAxis
                dataKey="date"
                tickFormatter={shortDate}
                tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                minTickGap={28}
              />
              <YAxis
                width={44}
                tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v) =>
                  metric.key === "spend"
                    ? `$${Number(v).toFixed(0)}`
                    : Number(v) >= 1000
                      ? `${(Number(v) / 1000).toFixed(1)}k`
                      : String(v)
                }
              />
              <RechartsTooltip
                cursor={{ stroke: metric.color, strokeWidth: 1, strokeOpacity: 0.35 }}
                content={
                  <ChartTooltip format={metric.format} metricLabel={metric.label} />
                }
              />
              <Area
                type="monotone"
                dataKey={metric.key}
                stroke={metric.color}
                strokeWidth={2.25}
                fill={`url(#${gradientId})`}
                activeDot={{
                  r: 4,
                  strokeWidth: 2,
                  stroke: "hsl(var(--background))",
                  fill: metric.color,
                }}
                animationDuration={600}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}

export function AdsDailyCharts({
  data,
  loading,
  className,
  emptyHint = "No daily series for this range yet. Sync ads to populate charts.",
  conversionsHint = "Conversions",
  rangeTotals,
}: {
  data: DailyChartPoint[];
  loading?: boolean;
  className?: string;
  emptyHint?: string;
  conversionsHint?: string;
  rangeTotals?: Partial<Record<MetricKey, number>>;
}) {
  const metrics = useMemo(() => buildMetrics(conversionsHint), [conversionsHint]);
  const totals = useMemo(() => {
    const summed = data.reduce(
      (acc, d) => {
        acc.spend += d.spend || 0;
        acc.impressions += d.impressions || 0;
        acc.clicks += d.clicks || 0;
        acc.conversions += d.conversions || 0;
        return acc;
      },
      { spend: 0, impressions: 0, clicks: 0, conversions: 0 },
    );
    return {
      spend: rangeTotals?.spend ?? summed.spend,
      impressions: rangeTotals?.impressions ?? summed.impressions,
      clicks: rangeTotals?.clicks ?? summed.clicks,
      conversions: rangeTotals?.conversions ?? summed.conversions,
    };
  }, [data, rangeTotals]);

  if (loading) {
    return (
      <div className={cn("grid gap-4 lg:grid-cols-2", className)}>
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-[240px] w-full rounded-xl" />
        ))}
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <Card className={className}>
        <CardContent className="py-12 text-center text-sm text-muted-foreground">
          {emptyHint}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className={cn("grid gap-4 lg:grid-cols-2", className)}>
      {metrics.map((metric) => (
        <MetricAreaChart
          key={metric.key}
          data={data}
          metric={metric}
          total={totals[metric.key]}
        />
      ))}
    </div>
  );
}

export function MetaDailyCharts(
  props: Omit<Parameters<typeof AdsDailyCharts>[0], "conversionsHint" | "emptyHint"> & {
    conversionsHint?: string;
    emptyHint?: string;
  },
) {
  return (
    <AdsDailyCharts
      {...props}
      conversionsHint={props.conversionsHint ?? "Meta conversions"}
      emptyHint={
        props.emptyHint ?? "No daily series for this range yet. Sync Meta ads to populate charts."
      }
    />
  );
}
