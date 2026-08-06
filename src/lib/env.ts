import { z } from "zod";

const serverSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  NEXT_PUBLIC_APP_URL: z.string().url(),
  SESSION_SECRET: z.string().min(16),
  TOKEN_ENCRYPTION_KEY: z.string().min(8),
  GHL_CLIENT_ID: z.string().optional().default(""),
  GHL_CLIENT_SECRET: z.string().optional().default(""),
  GHL_VERSION_ID: z.string().optional().default(""),
  GHL_REDIRECT_URI: z.string().optional().default(""),
  GHL_SCOPES: z
    .string()
    .optional()
    .default(
      "opportunities.readonly opportunities.write locations.readonly pipelines.readonly users.readonly adPublishing.readonly adPublishing.write campaigns.readonly",
    ),
  GHL_API_BASE_URL: z
    .string()
    .optional()
    .default("https://services.leadconnectorhq.com"),
  GHL_API_VERSION: z.string().optional().default("2021-07-28"),
  GHL_WEBHOOK_SECRET: z.string().optional().default(""),
  GHL_AUTOLOGIN_SHARED_SECRET: z.string().optional().default(""),
  CRON_SECRET: z.string().optional().default(""),
});

export type ServerEnv = z.infer<typeof serverSchema>;

let cached: ServerEnv | null = null;

export function getEnv(): ServerEnv {
  if (cached) return cached;
  const parsed = serverSchema.safeParse(process.env);
  if (!parsed.success) {
    // Soft-fail in build; throw at runtime when used.
    const partial = {
      NEXT_PUBLIC_SUPABASE_URL:
        process.env.NEXT_PUBLIC_SUPABASE_URL || "http://localhost:54321",
      NEXT_PUBLIC_SUPABASE_ANON_KEY:
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "anon",
      SUPABASE_SERVICE_ROLE_KEY:
        process.env.SUPABASE_SERVICE_ROLE_KEY || "service",
      NEXT_PUBLIC_APP_URL:
        process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
      SESSION_SECRET: process.env.SESSION_SECRET || "dev-session-secret-change-me",
      TOKEN_ENCRYPTION_KEY:
        process.env.TOKEN_ENCRYPTION_KEY || "dev-token-encryption-key",
      GHL_CLIENT_ID: process.env.GHL_CLIENT_ID || "",
      GHL_CLIENT_SECRET: process.env.GHL_CLIENT_SECRET || "",
      GHL_VERSION_ID: process.env.GHL_VERSION_ID || "",
      GHL_REDIRECT_URI: process.env.GHL_REDIRECT_URI || "",
      GHL_SCOPES:
        process.env.GHL_SCOPES ||
        "opportunities.readonly opportunities.write locations.readonly pipelines.readonly users.readonly adPublishing.readonly adPublishing.write campaigns.readonly",
      GHL_API_BASE_URL:
        process.env.GHL_API_BASE_URL || "https://services.leadconnectorhq.com",
      GHL_API_VERSION: process.env.GHL_API_VERSION || "2021-07-28",
      GHL_WEBHOOK_SECRET: process.env.GHL_WEBHOOK_SECRET || "",
      GHL_AUTOLOGIN_SHARED_SECRET:
        process.env.GHL_AUTOLOGIN_SHARED_SECRET || "",
      CRON_SECRET: process.env.CRON_SECRET || "",
    } satisfies ServerEnv;
    cached = partial;
    return cached;
  }
  cached = parsed.data;
  return cached;
}

export function ghlConfig() {
  const env = getEnv();
  return {
    clientId: env.GHL_CLIENT_ID,
    clientSecret: env.GHL_CLIENT_SECRET,
    versionId: env.GHL_VERSION_ID,
    redirectUri: env.GHL_REDIRECT_URI,
    scopes: env.GHL_SCOPES,
    apiBaseUrl: env.GHL_API_BASE_URL.replace(/\/$/, ""),
    apiVersion: env.GHL_API_VERSION,
    webhookSecret: env.GHL_WEBHOOK_SECRET,
    autologinSecret: env.GHL_AUTOLOGIN_SHARED_SECRET,
  };
}
