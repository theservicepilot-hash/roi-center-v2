"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Check,
  CheckCircle2,
  ChevronDown,
  GitBranch,
  Layers,
  RefreshCw,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/features/auth/AuthProvider";
import { api, errorMessage } from "@/lib/api";
import { cn, formatDate } from "@/lib/utils";

interface Pipeline {
  id: string;
  name: string;
  stages?: { id: string; name: string }[];
}

interface CrmSetup {
  location_id: string;
  pipeline_id: string;
  pipeline_name: string;
  setup_status: string;
  confirmed_at: string | null;
  last_synced_at: string | null;
  opportunities_synced: number;
  opportunity_count?: number;
  sync_status: string;
  last_sync_error: string;
  is_configured: boolean;
  pipelines?: Pipeline[];
  sync_queued?: boolean;
  synced?: boolean;
}

export function RoiCrmSetupCard({ locationKey }: { locationKey: string | undefined }) {
  const { hasPermission } = useAuth();
  const canManage = hasPermission("report.manage");
  const queryClient = useQueryClient();
  const [pipelineId, setPipelineId] = useState("");

  const setupQuery = useQuery({
    queryKey: ["roi-crm-setup", locationKey],
    queryFn: async () => {
      return api.get<CrmSetup>("/roi/crm/setup", { params: { discover: "1" } });
    },
    enabled: Boolean(locationKey),
  });

  useEffect(() => {
    if (setupQuery.data?.pipeline_id) {
      setPipelineId(setupQuery.data.pipeline_id);
    }
  }, [setupQuery.data?.pipeline_id, locationKey]);

  const invalidateRoi = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["roi-crm-setup", locationKey] }),
      queryClient.invalidateQueries({ queryKey: ["roi-crm-returns", locationKey] }),
    ]);
  };

  const applyMutation = useMutation({
    mutationFn: async () => {
      const selected = (setupQuery.data?.pipelines ?? []).find((p) => p.id === pipelineId);
      return api.post<CrmSetup>("/roi/crm/setup", {
        pipeline_id: pipelineId,
        pipeline_name: selected?.name || "",
        sync: true,
      });
    },
    onSuccess: async () => {
      await invalidateRoi();
    },
  });

  const setup = setupQuery.data;
  const pipelines = setup?.pipelines ?? [];
  const selected = useMemo(
    () => pipelines.find((p) => p.id === pipelineId) ?? null,
    [pipelines, pipelineId],
  );
  const pipelineChanged = Boolean(
    pipelineId && setup?.pipeline_id && pipelineId !== setup.pipeline_id,
  );
  const totalOpps = setup?.opportunity_count ?? setup?.opportunities_synced ?? 0;

  if (setupQuery.isLoading) {
    return <Skeleton className="h-36 w-full rounded-xl" />;
  }

  if (setupQuery.isError) {
    return (
      <Card>
        <CardContent className="p-5 text-sm text-destructive">
          {errorMessage(setupQuery.error, "Couldn't load CRM pipelines.")}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <CardTitle className="flex items-center gap-2 text-base">
              <GitBranch className="size-4" />
              CRM pipeline for ROAS
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              Pick a pipeline, then apply — dashboard KPIs use only that pipeline&apos;s
              opportunities. Source values like &quot;Facebook&quot; or &quot;google lead&quot; split
              channel ROAS.
            </p>
          </div>
          {setup?.is_configured && !pipelineChanged ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-success/12 px-2.5 py-1 text-xs font-medium text-success">
              <CheckCircle2 className="size-3.5" />
              Active
            </span>
          ) : pipelineChanged ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2.5 py-1 text-xs font-medium text-amber-800">
              Unsaved change
            </span>
          ) : null}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label id="roi-pipeline-label">Pipeline</Label>
          <DropdownMenu>
            <DropdownMenuTrigger asChild disabled={!canManage || applyMutation.isPending}>
              <button
                type="button"
                aria-labelledby="roi-pipeline-label"
                className={cn(
                  "flex h-11 w-full items-center gap-3 rounded-xl border border-border bg-background px-3 text-left text-sm shadow-sm transition-colors",
                  "hover:border-foreground/20 hover:bg-muted/30",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  "disabled:cursor-not-allowed disabled:opacity-60",
                  pipelineChanged && "border-amber-400/60",
                )}
              >
                <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <GitBranch className="size-4" />
                </span>
                <span className="min-w-0 flex-1">
                  {selected ? (
                    <>
                      <span className="block truncate font-medium text-foreground">
                        {selected.name}
                      </span>
                      <span className="block text-[11px] text-muted-foreground">
                        {(selected.stages?.length ?? 0) > 0
                          ? `${selected.stages!.length} stages`
                          : "GHL pipeline"}
                      </span>
                    </>
                  ) : (
                    <span className="block text-muted-foreground">Select a pipeline…</span>
                  )}
                </span>
                <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="start"
              className="w-[var(--radix-dropdown-menu-trigger-width)] max-h-80 overflow-y-auto p-1.5 scrollbar-thin"
            >
              <DropdownMenuLabel className="px-2.5 py-2 text-[11px] uppercase tracking-wide">
                Available pipelines ({pipelines.length})
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              {pipelines.length === 0 ? (
                <div className="px-3 py-6 text-center text-sm text-muted-foreground">
                  No pipelines found for this location.
                </div>
              ) : (
                pipelines.map((p) => {
                  const active = p.id === pipelineId;
                  const saved = p.id === setup?.pipeline_id;
                  const stageCount = p.stages?.length ?? 0;
                  return (
                    <DropdownMenuItem
                      key={p.id}
                      onSelect={() => setPipelineId(p.id)}
                      className={cn(
                        "my-0.5 cursor-pointer gap-3 rounded-lg px-2.5 py-2.5",
                        active && "bg-primary/8 focus:bg-primary/10",
                      )}
                    >
                      <span
                        className={cn(
                          "flex size-8 shrink-0 items-center justify-center rounded-lg",
                          active
                            ? "bg-primary text-primary-foreground"
                            : "bg-muted text-muted-foreground",
                        )}
                      >
                        <Layers className="size-3.5" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium text-foreground">
                          {p.name}
                        </span>
                        <span className="block text-[11px] text-muted-foreground">
                          {stageCount > 0 ? `${stageCount} stages` : "No stages listed"}
                          {saved ? " · active on dashboard" : ""}
                        </span>
                      </span>
                      {active ? (
                        <Check className="size-4 shrink-0 text-primary" />
                      ) : (
                        <span className="size-4 shrink-0" />
                      )}
                    </DropdownMenuItem>
                  );
                })
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {canManage ? (
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              size="sm"
              loading={applyMutation.isPending}
              disabled={!pipelineId || applyMutation.isPending}
              onClick={() => applyMutation.mutate()}
            >
              <RefreshCw className="size-4" />
              {pipelineChanged || !setup?.is_configured
                ? "Save & sync pipeline"
                : "Sync opportunities"}
            </Button>
            {pipelineChanged ? (
              <p className="text-xs text-amber-800">
                Dashboard still uses{" "}
                <span className="font-medium">
                  {setup?.pipeline_name || "the previous pipeline"}
                </span>{" "}
                until you save.
              </p>
            ) : null}
          </div>
        ) : null}

        {applyMutation.isError ? (
          <p className="text-sm text-destructive">
            {errorMessage(applyMutation.error, "Couldn't update CRM pipeline.")}
          </p>
        ) : null}

        {setup?.is_configured ? (
          <p className="text-xs text-muted-foreground">
            Active: {setup.pipeline_name || setup.pipeline_id}
            {setup.last_synced_at
              ? ` · Last sync ${formatDate(setup.last_synced_at)} · ${totalOpps.toLocaleString()} opportunities`
              : ` · ${totalOpps.toLocaleString()} opportunities · not synced yet`}
            {setup.sync_status === "error" && setup.last_sync_error
              ? ` · Error: ${setup.last_sync_error}`
              : ""}
          </p>
        ) : (
          <p className="text-xs text-muted-foreground">
            Select a pipeline and save to load its opportunities into the dashboard.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
