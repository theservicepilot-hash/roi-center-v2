"use client";

import { Loader2, TrendingUp } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { Button } from "@/components/ui/button";
import { useAuth } from "@/features/auth/AuthProvider";

export default function HomePage() {
  const { user, location, loading, error } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && user && location) {
      router.replace("/roi");
    }
  }, [loading, user, location, router]);

  if (loading) {
    return (
      <div className="flex min-h-full flex-col items-center justify-center gap-3">
        <Loader2 className="size-8 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">Loading…</p>
      </div>
    );
  }

  if (user && location) {
    return (
      <div className="flex min-h-full items-center justify-center">
        <Loader2 className="size-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="relative flex min-h-full flex-col items-center justify-center px-4 py-16">
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-teal-50/70 via-slate-50 to-slate-100" />
      <div className="relative z-10 w-full max-w-lg rounded-2xl border border-border bg-card p-10 text-center shadow-sm">
        <div className="mx-auto mb-5 flex size-16 items-center justify-center rounded-2xl bg-primary text-2xl font-bold text-primary-foreground">
          R
        </div>
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">ROI Center</h1>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          Facebook and Google ads ROAS for GoHighLevel locations. Install the app on your sub-account
          to connect ad spend with CRM pipeline revenue.
        </p>
        {error ? (
          <p className="mt-4 rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        ) : null}
        <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <Button asChild size="lg">
            <a href="/api/auth/crm/authorize">
              <TrendingUp className="size-4" />
              Install from GHL Marketplace
            </a>
          </Button>
          <Button asChild variant="outline" size="lg">
            <Link href="/roi">Open dashboard</Link>
          </Button>
        </div>
        <p className="mt-6 text-xs text-muted-foreground">
          Already installed? Open from your GHL custom menu link with{" "}
          <code className="rounded bg-muted px-1 py-0.5 font-mono text-[11px]">
            ?embed=1&amp;email=…&amp;location_id=…
          </code>
        </p>
      </div>
    </div>
  );
}
