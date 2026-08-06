const MICROS = 1_000_000;

export function toDecimal(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function toInt(value: unknown): number {
  if (value === null || value === undefined || value === "") return 0;
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.trunc(n);
}

export function toNumber(value: unknown, fallback = 0): number {
  const n = toDecimal(value);
  return n === null ? fallback : n;
}

export function safeDiv(
  num: number,
  den: number,
  decimals = 4,
): number | null {
  if (den === 0) return null;
  const factor = 10 ** decimals;
  return Math.round((num / den) * factor) / factor;
}

export function leadsFromResults(results: unknown): number {
  if (!results || typeof results !== "object") return 0;
  const row = results as Record<string, unknown>;
  for (const key of ["lead", "onsiteConversion.leadGrouped"]) {
    if (key in row) return toInt(row[key]);
  }
  return 0;
}

export function leadsFromTotals(totals: Record<string, unknown>): number {
  const breakdown =
    totals.resultsBreakdown ?? totals.results_breakdown ?? null;
  if (breakdown && typeof breakdown === "object") {
    const b = breakdown as Record<string, unknown>;
    for (const key of ["lead", "onsiteConversion.leadGrouped"]) {
      if (key in b) return toInt(b[key]);
    }
  }
  return toInt(totals.conversions);
}

export function fromMicros(value: unknown, quantize = 0.01): number {
  const raw = toDecimal(value);
  if (raw === null) return 0;
  const factor = 10 ** (quantize.toString().split(".")[1]?.length ?? 0);
  return Math.round((raw / MICROS) * factor) / factor;
}

export function optionalFromMicros(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  return fromMicros(value, 0.000001);
}

export function parseDate(value: unknown): string | null {
  if (!value) return null;
  if (typeof value === "string") {
    const s = value.slice(0, 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
  }
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  return null;
}

export function parseDt(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") {
    let ts = value;
    if (ts > 1e12) ts = ts / 1000;
    try {
      return new Date(ts * 1000).toISOString();
    } catch {
      return null;
    }
  }
  const text = String(value).trim();
  if (!text) return null;
  const normalized = text.replace("Z", "+00:00");
  const d = new Date(normalized);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function addDays(iso: string, delta: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

export function expectedDays(start: string, end: string): number {
  const s = new Date(`${start}T12:00:00Z`).getTime();
  const e = new Date(`${end}T12:00:00Z`).getTime();
  return Math.floor((e - s) / 86_400_000) + 1;
}

export function money(value: unknown): number {
  const n = toDecimal(value);
  if (n === null) return 0;
  return Math.round(n * 100) / 100;
}
