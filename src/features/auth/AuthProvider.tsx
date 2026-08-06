"use client";

import * as React from "react";

import { api, errorMessage, locationStore, tokenStore } from "@/lib/api";
import { captureEmbedFromUrl } from "@/lib/embed";

export interface AuthUser {
  id: string;
  email: string;
}

export interface AuthLocation {
  id: string;
  ghl_location_id: string;
  name: string;
}

export interface SessionPayload {
  access: string;
  refresh: string;
  user: AuthUser;
  location: AuthLocation;
  role: string;
  permissions: string[];
}

interface MeResponse {
  user: AuthUser;
  location: AuthLocation;
  role: string;
  permissions: string[];
}

interface AuthContextValue {
  user: AuthUser | null;
  location: AuthLocation | null;
  permissions: string[];
  loading: boolean;
  error: string | null;
  hasPermission: (codename: string) => boolean;
  setSession: (data: SessionPayload) => void;
  logout: () => void;
}

const AuthContext = React.createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const ctx = React.useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

function readMenuLinkParams(): { email: string | null; locationId: string | null } {
  if (window.location.pathname.startsWith("/oauth/")) {
    return { email: null, locationId: null };
  }
  const params = new URLSearchParams(window.location.search);
  const email = params.get("email")?.trim() || null;
  const locationId =
    params.get("location_id")?.trim() || params.get("locationId")?.trim() || null;
  return { email, locationId };
}

function stripAuthParamsFromUrl() {
  const url = new URL(window.location.href);
  ["email", "location_id", "locationId", "shared_secret"].forEach((k) =>
    url.searchParams.delete(k),
  );
  window.history.replaceState({}, "", url.toString());
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = React.useState<AuthUser | null>(null);
  const [location, setLocation] = React.useState<AuthLocation | null>(null);
  const [permissions, setPermissions] = React.useState<string[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const setSession = React.useCallback((data: SessionPayload) => {
    tokenStore.set(data.access, data.refresh);
    locationStore.set(data.location.ghl_location_id);
    setUser(data.user);
    setLocation(data.location);
    setPermissions(data.permissions);
    setError(null);
  }, []);

  const logout = React.useCallback(() => {
    tokenStore.clear();
    locationStore.clear();
    setUser(null);
    setLocation(null);
    setPermissions([]);
    setError(null);
  }, []);

  const hasPermission = React.useCallback(
    (codename: string) => permissions.includes(codename),
    [permissions],
  );

  React.useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      captureEmbedFromUrl();
      const { email, locationId } = readMenuLinkParams();

      if (email && locationId) {
        try {
          const data = await api.post<SessionPayload>("/auth/crm/auto-login", {
            email,
            location_id: locationId,
          });
          if (cancelled) return;
          setSession(data);
          stripAuthParamsFromUrl();
        } catch (err) {
          if (cancelled) return;
          setError(errorMessage(err, "Automatic sign-in failed."));
        } finally {
          if (!cancelled) setLoading(false);
        }
        return;
      }

      if (locationId && !email) {
        if (!cancelled) {
          setError(
            "Your link has a locationId but no email. Add ?email={{user.email}}&location_id={{location.id}} to the GHL custom menu link.",
          );
          setLoading(false);
        }
        return;
      }

      if (tokenStore.getAccess()) {
        try {
          const data = await api.get<MeResponse>("/auth/me");
          if (cancelled) return;
          setUser(data.user);
          setLocation(data.location);
          setPermissions(data.permissions);
          locationStore.set(data.location.ghl_location_id);
        } catch {
          if (cancelled) return;
          tokenStore.clear();
          locationStore.clear();
        }
      }

      if (!cancelled) setLoading(false);
    }

    void bootstrap();
    return () => {
      cancelled = true;
    };
  }, [setSession]);

  const value = React.useMemo<AuthContextValue>(
    () => ({
      user,
      location,
      permissions,
      loading,
      error,
      hasPermission,
      setSession,
      logout,
    }),
    [user, location, permissions, loading, error, hasPermission, setSession, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
