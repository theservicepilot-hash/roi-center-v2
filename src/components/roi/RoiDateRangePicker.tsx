"use client";

import { CalendarDays, Check, ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

const SIDEBAR_PRESETS: { label: string; days: number }[] = [
  { label: "Last 7 days", days: 7 },
  { label: "Last 14 days", days: 14 },
  { label: "Last 30 days", days: 30 },
  { label: "Last 90 days", days: 90 },
];

function parseIso(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

function toIso(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function addMonths(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth() + n, 1);
}

function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function isBefore(a: Date, b: Date): boolean {
  return toIso(a) < toIso(b);
}

function isInRange(day: Date, start: Date | null, end: Date | null): boolean {
  if (!start || !end) return false;
  const t = toIso(day);
  return t > toIso(start) && t < toIso(end);
}

function formatNice(iso: string): string {
  if (!iso) return "—";
  return parseIso(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatHeaderRange(start: string, end: string): string {
  return `${formatNice(start)} – ${formatNice(end)}`;
}

function buildMonthCells(month: Date): (Date | null)[] {
  const first = startOfMonth(month);
  const startPad = first.getDay();
  const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const cells: (Date | null)[] = [];
  for (let i = 0; i < startPad; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push(new Date(month.getFullYear(), month.getMonth(), d));
  }
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

export function RoiDateRangePicker({
  startDate,
  endDate,
  onChange,
  presets,
}: {
  startDate: string;
  endDate: string;
  onChange: (start: string, end: string) => void;
  presets: { label: string; days: number }[];
}) {
  const [open, setOpen] = useState(false);
  const [draftStart, setDraftStart] = useState(startDate);
  const [draftEnd, setDraftEnd] = useState(endDate);
  const [pickingEnd, setPickingEnd] = useState(false);
  const [viewMonth, setViewMonth] = useState(() => startOfMonth(parseIso(endDate)));

  useEffect(() => {
    if (!open) return;
    setDraftStart(startDate);
    setDraftEnd(endDate);
    setPickingEnd(false);
    setViewMonth(startOfMonth(parseIso(endDate)));
  }, [open, startDate, endDate]);

  const cells = useMemo(() => buildMonthCells(viewMonth), [viewMonth]);
  const draftStartDate = draftStart ? parseIso(draftStart) : null;
  const draftEndDate = draftEnd ? parseIso(draftEnd) : null;
  const canApply = Boolean(draftStart && draftEnd && draftStart <= draftEnd);

  const applyRangeDays = (days: number) => {
    const end = new Date();
    const start = new Date();
    start.setDate(end.getDate() - (days - 1));
    onChange(toIso(start), toIso(end));
    setOpen(false);
  };

  const onDayClick = (day: Date) => {
    if (!pickingEnd || !draftStartDate) {
      setDraftStart(toIso(day));
      setDraftEnd(toIso(day));
      setPickingEnd(true);
      return;
    }
    if (isBefore(day, draftStartDate)) {
      setDraftStart(toIso(day));
      setDraftEnd(toIso(draftStartDate));
    } else {
      setDraftEnd(toIso(day));
    }
    setPickingEnd(false);
  };

  const monthLabel = viewMonth.toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex flex-wrap gap-1.5">
        {presets.map((p) => {
          const active = (() => {
            const end = new Date();
            const start = new Date();
            start.setDate(end.getDate() - (p.days - 1));
            return startDate === toIso(start) && endDate === toIso(end);
          })();
          return (
            <button
              key={p.label}
              type="button"
              onClick={() => applyRangeDays(p.days)}
              className={cn(
                "h-9 rounded-full px-3 text-xs font-medium transition-colors",
                active
                  ? "bg-foreground text-background"
                  : "bg-muted/70 text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              {p.label}
            </button>
          );
        })}
      </div>

      <DropdownMenu open={open} onOpenChange={setOpen}>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className={cn(
              "inline-flex h-9 min-w-[240px] items-center gap-2 rounded-xl border border-border bg-background px-3 text-left text-sm shadow-sm transition-colors",
              "hover:border-foreground/20 hover:bg-muted/20",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            )}
          >
            <CalendarDays className="size-4 shrink-0 text-primary" />
            <span className="min-w-0 flex-1 truncate font-medium text-foreground">
              {formatHeaderRange(startDate, endDate)}
            </span>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="start"
          className="w-auto overflow-hidden rounded-xl border border-border p-0 shadow-xl"
          onCloseAutoFocus={(e) => e.preventDefault()}
        >
          <div className="bg-primary px-4 py-3 text-primary-foreground">
            <p className="text-[11px] font-medium uppercase tracking-wide opacity-80">
              {draftStart ? parseIso(draftStart).getFullYear() : new Date().getFullYear()}
            </p>
            <p className="mt-0.5 text-sm font-semibold">
              {formatHeaderRange(draftStart || startDate, draftEnd || endDate)}
            </p>
          </div>

          <div className="flex flex-col sm:flex-row">
            <div className="flex max-h-64 flex-col gap-1.5 overflow-y-auto border-b border-border p-3 sm:w-40 sm:border-b-0 sm:border-r scrollbar-thin">
              <p className="mb-1 px-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                Quick range
              </p>
              {SIDEBAR_PRESETS.map((p) => (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => {
                    const end = new Date();
                    const start = new Date();
                    start.setDate(end.getDate() - (p.days - 1));
                    setDraftStart(toIso(start));
                    setDraftEnd(toIso(end));
                    setPickingEnd(false);
                    setViewMonth(startOfMonth(end));
                  }}
                  className="rounded-lg border border-border bg-background px-2.5 py-1.5 text-left text-xs font-medium text-primary transition-colors hover:bg-primary/5"
                >
                  {p.label}
                </button>
              ))}
            </div>

            <div className="w-[280px] p-3">
              <div className="mb-3 flex items-center justify-between">
                <button
                  type="button"
                  aria-label="Previous month"
                  onClick={() => setViewMonth((m) => addMonths(m, -1))}
                  className="flex size-8 items-center justify-center rounded-lg text-primary hover:bg-primary/10"
                >
                  <ChevronLeft className="size-4" />
                </button>
                <p className="text-sm font-semibold text-primary">{monthLabel}</p>
                <button
                  type="button"
                  aria-label="Next month"
                  onClick={() => setViewMonth((m) => addMonths(m, 1))}
                  className="flex size-8 items-center justify-center rounded-lg text-primary hover:bg-primary/10"
                >
                  <ChevronRight className="size-4" />
                </button>
              </div>

              <div className="mb-1 grid grid-cols-7 gap-0.5">
                {WEEKDAYS.map((d) => (
                  <div
                    key={d}
                    className="py-1 text-center text-[10px] font-medium uppercase tracking-wide text-muted-foreground"
                  >
                    {d}
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-7 gap-0.5">
                {cells.map((day, idx) => {
                  if (!day) {
                    return <div key={`empty-${idx}`} className="h-9" />;
                  }
                  const iso = toIso(day);
                  const isStart = draftStartDate ? sameDay(day, draftStartDate) : false;
                  const isEnd = draftEndDate ? sameDay(day, draftEndDate) : false;
                  const inMiddle = isInRange(day, draftStartDate, draftEndDate);
                  const isEdge = isStart || isEnd;
                  const today = sameDay(day, new Date());

                  return (
                    <button
                      key={iso}
                      type="button"
                      onClick={() => onDayClick(day)}
                      className={cn(
                        "relative h-9 text-sm transition-colors",
                        inMiddle && "bg-primary/10 text-foreground",
                        isStart && draftEndDate && "rounded-l-lg",
                        isEnd && draftStartDate && "rounded-r-lg",
                        isEdge && "z-[1] rounded-lg bg-primary font-semibold text-primary-foreground",
                        !isEdge && !inMiddle && "rounded-lg hover:bg-muted",
                        today && !isEdge && "font-semibold text-primary",
                      )}
                    >
                      {day.getDate()}
                    </button>
                  );
                })}
              </div>

              <p className="mt-3 text-[11px] text-muted-foreground">
                {pickingEnd ? "Select an end date" : "Click a start date, then an end date"}
              </p>

              <div className="mt-3 flex justify-end">
                <Button
                  type="button"
                  size="sm"
                  disabled={!canApply}
                  onClick={() => {
                    if (!canApply) return;
                    onChange(draftStart, draftEnd);
                    setOpen(false);
                  }}
                  className="gap-1.5"
                >
                  <Check className="size-3.5" />
                  Apply
                </Button>
              </div>
            </div>
          </div>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
