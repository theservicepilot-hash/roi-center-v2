"use client";

import { useId, useMemo } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from "recharts";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn, formatDate } from "@/lib/utils";

export interface CombinedSpendPoint {
  date: string;
  facebook: number;
  google: number;
  total: number;
}

function money(n: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(n || 0);
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
}: {
  active?: boolean;
  payload?: Array<{ dataKey?: string; value?: number; color?: string }>;
  label?: string;
}) {
  if (!active || !payload?.length || !label) return null;
  return (
    <div className="rounded-lg border border-border/70 bg-popover px-3 py-2 shadow-lg">
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {formatDate(label)}
      </p>
      <div className="mt-1.5 space-y-1">
        {payload.map((p) => (
          <p
            key={String(p.dataKey)}
            className="text-sm font-semibold tabular-nums text-foreground"
            style={{ color: p.color }}
          >
            {p.dataKey === "facebook"
              ? "Facebook"
              : p.dataKey === "google"
                ? "Google"
                : "Total"}
            : {money(Number(p.value ?? 0))}
          </p>
        ))}
      </div>
    </div>
  );
}

export function CombinedSpendChart({
  data,
  loading,
  className,
}: {
  data: CombinedSpendPoint[];
  loading?: boolean;
  className?: string;
}) {
  const gid = useId().replace(/:/g, "");
  const totals = useMemo(
    () =>
      data.reduce(
        (acc, d) => {
          acc.facebook += d.facebook || 0;
          acc.google += d.google || 0;
          acc.total += d.total || 0;
          return acc;
        },
        { facebook: 0, google: 0, total: 0 },
      ),
    [data],
  );

  if (loading) {
    return <Skeleton className={cn("h-[320px] w-full rounded-xl", className)} />;
  }

  if (data.length === 0) {
    return (
      <Card className={className}>
        <CardContent className="py-14 text-center text-sm text-muted-foreground">
          No spend series yet. Sync Facebook and Google for this range to build the overview.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={cn("overflow-hidden", className)}>
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <CardTitle className="text-base">Paid spend over time</CardTitle>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Facebook and Google daily spend in the selected range
            </p>
          </div>
          <div className="text-right">
            <p className="text-2xl font-semibold tabular-nums tracking-tight text-foreground">
              {money(totals.total)}
            </p>
            <p className="text-[11px] text-muted-foreground">Combined range total</p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pb-4 pt-0">
        <div className="h-[240px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 12, right: 8, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id={`fb-${gid}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#1877F2" stopOpacity={0.28} />
                  <stop offset="100%" stopColor="#1877F2" stopOpacity={0.02} />
                </linearGradient>
                <linearGradient id={`gg-${gid}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#409050" stopOpacity={0.32} />
                  <stop offset="100%" stopColor="#409050" stopOpacity={0.02} />
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
                width={48}
                tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v) => `$${Number(v).toFixed(0)}`}
              />
              <RechartsTooltip content={<ChartTooltip />} />
              <Legend
                verticalAlign="top"
                height={28}
                iconType="circle"
                formatter={(value) => (
                  <span className="text-xs text-muted-foreground">
                    {value === "facebook" ? "Facebook" : "Google"}
                  </span>
                )}
              />
              <Area
                type="monotone"
                dataKey="facebook"
                name="facebook"
                stroke="#1877F2"
                strokeWidth={2.25}
                fill={`url(#fb-${gid})`}
                animationDuration={700}
              />
              <Area
                type="monotone"
                dataKey="google"
                name="google"
                stroke="#409050"
                strokeWidth={2.25}
                fill={`url(#gg-${gid})`}
                animationDuration={700}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}

export function mergeDailySpend(
  facebook: Array<{ date: string; spend: number }>,
  google: Array<{ date: string; spend: number }>,
): CombinedSpendPoint[] {
  const map = new Map<string, CombinedSpendPoint>();
  for (const row of facebook) {
    const cur = map.get(row.date) ?? { date: row.date, facebook: 0, google: 0, total: 0 };
    cur.facebook = row.spend || 0;
    cur.total = cur.facebook + cur.google;
    map.set(row.date, cur);
  }
  for (const row of google) {
    const cur = map.get(row.date) ?? { date: row.date, facebook: 0, google: 0, total: 0 };
    cur.google = row.spend || 0;
    cur.total = cur.facebook + cur.google;
    map.set(row.date, cur);
  }
  return Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date));
}
