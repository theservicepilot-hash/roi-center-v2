"use client";

import { CheckCircle2, Loader2, TrendingUp, XCircle } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

import { Button, buttonVariants } from "@/components/ui/button";
import { useAuth, type SessionPayload } from "@/features/auth/AuthProvider";
import { api, errorMessage } from "@/lib/api";
import { cn } from "@/lib/utils";

function OAuthSuccessContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { setSession } = useAuth();

  const loginCode = searchParams.get("login_code");
  const errorParam = searchParams.get("error");
  const locationId = searchParams.get("location_id");
  const success = !errorParam;

  const [phase, setPhase] = useState<"idle" | "signing-in" | "done" | "failed">(
    success && loginCode ? "signing-in" : errorParam ? "failed" : "idle",
  );
  const [error, setError] = useState<string | null>(
    errorParam ? "Installation could not be completed." : null,
  );

  useEffect(() => {
    if (!success || !loginCode) return;
    let cancelled = false;

    (async () => {
      try {
        const data = await api.post<SessionPayload>("/auth/crm/oauth-session", {
          login_code: loginCode,
        });
        if (cancelled) return;
        setSession(data);
        setPhase("done");
        router.replace("/roi");
      } catch (err) {
        if (cancelled) return;
        setError(errorMessage(err, "Could not sign you in after onboarding."));
        setPhase("failed");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [success, loginCode, setSession, router]);

  return (
    <div className="relative flex min-h-full items-center justify-center overflow-hidden px-4">
      <div className="pointer-events-none absolute inset-0 bg-brand-wash" />
      <div className="relative z-10 w-full max-w-md rounded-2xl border border-border bg-card p-8 text-center shadow-sm">
        <div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-lg shadow-primary/20">
          <TrendingUp className="size-7" />
        </div>

        {phase === "signing-in" ? (
          <>
            <Loader2 className="mx-auto size-10 animate-spin text-primary" />
            <h1 className="mt-3 text-lg font-semibold text-foreground">Signing you in…</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Your location is connected. Taking you to ROI Center.
            </p>
          </>
        ) : phase === "failed" || errorParam ? (
          <>
            <XCircle className="mx-auto size-10 text-destructive" />
            <h1 className="mt-3 text-lg font-semibold text-foreground">Installation failed</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              {error || errorParam || "Something went wrong during the GoHighLevel connection."}
            </p>
            <a href="/api/auth/crm/authorize" className={cn(buttonVariants(), "mt-6 inline-flex")}>
              Try again
            </a>
          </>
        ) : (
          <>
            <CheckCircle2 className="mx-auto size-10 text-success" />
            <h1 className="mt-3 text-lg font-semibold text-foreground">Installation complete</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              {locationId
                ? `Location ${locationId} is connected.`
                : "Your location is connected to ROI Center."}
            </p>
            {!loginCode ? (
              <p className="mt-4 text-xs text-muted-foreground">
                Open the app from a GoHighLevel menu link to sign in, or continue if you already have
                a session.
              </p>
            ) : null}
            <Button className="mt-6" onClick={() => router.push("/roi")}>
              Go to ROI Center
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

export default function OAuthSuccessPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-full items-center justify-center">
          <Loader2 className="size-8 animate-spin text-primary" />
        </div>
      }
    >
      <OAuthSuccessContent />
    </Suspense>
  );
}
