import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { getEnv } from "@/lib/env";

export type Database = Record<string, unknown>;

let admin: SupabaseClient | null = null;

/** Service-role client — server only. Never import in client components. */
export function supabaseAdmin(): SupabaseClient {
  if (admin) return admin;
  const env = getEnv();
  admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return admin;
}
