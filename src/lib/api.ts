export interface ApiErrorBody {
  error?: { message?: string; code?: string };
}

const ACCESS_KEY = "rc.access";
const REFRESH_KEY = "rc.refresh";
const LOCATION_KEY = "rc.location_id";

export const tokenStore = {
  getAccess(): string | null {
    if (typeof window === "undefined") return null;
    return localStorage.getItem(ACCESS_KEY);
  },
  getRefresh(): string | null {
    if (typeof window === "undefined") return null;
    return localStorage.getItem(REFRESH_KEY);
  },
  set(access: string, refresh?: string) {
    localStorage.setItem(ACCESS_KEY, access);
    if (refresh) localStorage.setItem(REFRESH_KEY, refresh);
  },
  clear() {
    localStorage.removeItem(ACCESS_KEY);
    localStorage.removeItem(REFRESH_KEY);
  },
};

export const locationStore = {
  get(): string | null {
    if (typeof window === "undefined") return null;
    return localStorage.getItem(LOCATION_KEY);
  },
  set(ghlLocationId: string) {
    localStorage.setItem(LOCATION_KEY, ghlLocationId);
  },
  clear() {
    localStorage.removeItem(LOCATION_KEY);
  },
};

function buildUrl(path: string, params?: Record<string, string | undefined | null>) {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  const url = new URL(`/api${normalized}`, window.location.origin);
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (value != null && value !== "") url.searchParams.set(key, value);
    }
  }
  return url.toString();
}

async function parseJson<T>(res: Response): Promise<T> {
  const text = await res.text();
  if (!text) return {} as T;
  return JSON.parse(text) as T;
}

async function request<T>(
  path: string,
  init: RequestInit = {},
  params?: Record<string, string | undefined | null>,
): Promise<T> {
  const headers = new Headers(init.headers);
  if (!headers.has("Content-Type") && init.body) {
    headers.set("Content-Type", "application/json");
  }

  const access = tokenStore.getAccess();
  if (access) headers.set("Authorization", `Bearer ${access}`);

  const locationId = locationStore.get();
  if (locationId) headers.set("X-Location-Id", locationId);

  const res = await fetch(buildUrl(path, params), { ...init, headers });
  const body = await parseJson<T & ApiErrorBody>(res);

  if (!res.ok) {
    const message =
      (body as ApiErrorBody)?.error?.message ||
      res.statusText ||
      "Request failed";
    throw new Error(message);
  }

  return body as T;
}

export const api = {
  get<T>(path: string, options?: { params?: Record<string, string | undefined | null> }) {
    return request<T>(path, { method: "GET" }, options?.params);
  },
  post<T>(path: string, body?: unknown) {
    return request<T>(path, {
      method: "POST",
      body: body != null ? JSON.stringify(body) : undefined,
    });
  },
};

export function errorMessage(error: unknown, fallback = "Something went wrong."): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "object" && error !== null) {
    const data = error as ApiErrorBody;
    if (data.error?.message) return data.error.message;
  }
  return fallback;
}
