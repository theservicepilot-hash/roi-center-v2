"use client";

import * as React from "react";

import { useAuth } from "@/features/auth/AuthProvider";
import { isEmbedMode } from "@/lib/embed";
import { cn } from "@/lib/utils";

export function AppShell({ children }: { children: React.ReactNode }) {
  const { location } = useAuth();
  const [embedded, setEmbedded] = React.useState(false);

  React.useEffect(() => {
    setEmbedded(isEmbedMode());
  }, []);

  if (embedded) {
    return (
      <div className="flex min-h-full flex-col bg-background">
        <main className="flex-1 overflow-y-auto scrollbar-thin">
          <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8">{children}</div>
        </main>
      </div>
    );
  }

  return (
    <div className="flex min-h-full flex-col bg-background">
      <header className="sticky top-0 z-30 border-b border-border/80 bg-card/90 backdrop-blur-md">
        <div className="mx-auto flex h-14 w-full max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <div className="flex size-8 items-center justify-center rounded-lg bg-primary text-sm font-bold text-primary-foreground">
              R
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">ROI Center</p>
              {location ? (
                <p className="text-xs text-muted-foreground">{location.name}</p>
              ) : null}
            </div>
          </div>
        </div>
      </header>
      <main className={cn("flex-1 overflow-y-auto scrollbar-thin")}>
        <div className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8">{children}</div>
      </main>
    </div>
  );
}
