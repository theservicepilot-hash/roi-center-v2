import { supabaseAdmin } from "@/lib/supabase/admin";

export type JobType =
  | "meta.sync"
  | "meta.onboard"
  | "google.sync"
  | "google.onboard"
  | "crm.sync"
  | "ads.refresh_all"
  | "tokens.refresh_all";

export interface BackgroundJob {
  id: string;
  job_type: JobType | string;
  payload: Record<string, unknown>;
  status: string;
  attempts: number;
  max_attempts: number;
  last_error: string;
}

export async function enqueueJob(
  jobType: JobType,
  payload: Record<string, unknown> = {},
  opts: { runAfter?: Date; maxAttempts?: number } = {},
): Promise<string> {
  const db = supabaseAdmin();
  const { data, error } = await db
    .from("background_jobs")
    .insert({
      job_type: jobType,
      payload,
      status: "pending",
      max_attempts: opts.maxAttempts ?? 5,
      run_after: (opts.runAfter || new Date()).toISOString(),
    })
    .select("id")
    .single();
  if (error) throw error;
  return data.id as string;
}

export async function enqueueJobs(
  jobs: Array<{ type: JobType; payload?: Record<string, unknown> }>,
): Promise<string[]> {
  const ids: string[] = [];
  for (const j of jobs) {
    ids.push(await enqueueJob(j.type, j.payload || {}));
  }
  return ids;
}

/** Claim up to `limit` pending jobs (simple optimistic claim). */
export async function claimPendingJobs(limit = 3): Promise<BackgroundJob[]> {
  const db = supabaseAdmin();
  const now = new Date().toISOString();

  const { data: pending, error } = await db
    .from("background_jobs")
    .select("*")
    .eq("status", "pending")
    .lte("run_after", now)
    .order("created_at", { ascending: true })
    .limit(limit);

  if (error) throw error;
  if (!pending?.length) return [];

  const claimed: BackgroundJob[] = [];
  for (const row of pending) {
    const { data: updated, error: updErr } = await db
      .from("background_jobs")
      .update({
        status: "running",
        attempts: (row.attempts || 0) + 1,
        started_at: now,
        updated_at: now,
      })
      .eq("id", row.id)
      .eq("status", "pending")
      .select("*")
      .maybeSingle();

    if (!updErr && updated) {
      claimed.push(updated as BackgroundJob);
    }
  }
  return claimed;
}

export async function completeJob(
  id: string,
  result: Record<string, unknown> = {},
) {
  const db = supabaseAdmin();
  await db
    .from("background_jobs")
    .update({
      status: "success",
      result,
      finished_at: new Date().toISOString(),
      last_error: "",
    })
    .eq("id", id);
}

export async function failJob(id: string, err: unknown, attempts: number, maxAttempts: number) {
  const db = supabaseAdmin();
  const message = err instanceof Error ? err.message : String(err);
  const retry = attempts < maxAttempts;
  await db
    .from("background_jobs")
    .update({
      status: retry ? "pending" : "error",
      last_error: message.slice(0, 2000),
      run_after: retry
        ? new Date(Date.now() + Math.min(attempts, 5) * 60_000).toISOString()
        : undefined,
      finished_at: retry ? null : new Date().toISOString(),
    })
    .eq("id", id);
}
