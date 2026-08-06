import { ghlConfig } from "@/lib/env";

export class GhlApiError extends Error {
  code: string;
  details?: Record<string, unknown>;

  constructor(
    message: string,
    code = "ghl_api_error",
    details?: Record<string, unknown>,
  ) {
    super(message);
    this.code = code;
    this.details = details;
  }
}

export async function ghlGet(
  accessToken: string,
  path: string,
  params: Record<string, string> = {},
  version?: string,
): Promise<unknown> {
  const cfg = ghlConfig();
  const url = new URL(`${cfg.apiBaseUrl}${path}`);
  for (const [k, v] of Object.entries(params)) {
    if (v != null && v !== "") url.searchParams.set(k, v);
  }
  let res: Response;
  try {
    res = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Version: version || cfg.apiVersion,
        Accept: "application/json",
      },
      cache: "no-store",
    });
  } catch (e) {
    throw new GhlApiError("Failed to reach GoHighLevel API.", "ghl_network_error", {
      path,
      error: String(e),
    });
  }
  if (res.status >= 400) {
    const body = (await res.text()).slice(0, 1000);
    throw new GhlApiError("GoHighLevel API returned an error.", "ghl_api_error", {
      path,
      status: res.status,
      body,
    });
  }
  if (!res.body) return {};
  const text = await res.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    throw new GhlApiError("GoHighLevel returned non-JSON.", "ghl_invalid_json", {
      path,
    });
  }
}

export async function ghlPostForm(
  path: string,
  form: Record<string, string>,
  headers: Record<string, string> = {},
): Promise<Record<string, unknown>> {
  const cfg = ghlConfig();
  const body = new URLSearchParams(form);
  const res = await fetch(`${cfg.apiBaseUrl}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
      Version: cfg.apiVersion,
      ...headers,
    },
    body,
    cache: "no-store",
  });
  const text = await res.text();
  let json: Record<string, unknown> = {};
  try {
    json = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  } catch {
    throw new GhlApiError("Invalid OAuth response", "ghl_invalid_json", {
      body: text.slice(0, 400),
    });
  }
  if (res.status >= 400) {
    throw new GhlApiError("OAuth token exchange failed", "ghl_oauth_error", {
      status: res.status,
      body: json,
    });
  }
  return json;
}
