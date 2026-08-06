"use client";

import * as React from "react";

import { useAuth } from "@/features/auth/AuthProvider";
import { isEmbedMode } from "@/lib/embed";
import { cn } from "@/lib/utils";

export function AppShell({ children }: { children: React.ReactNode }) {
  const { location } = useAuth();
  const [embedded, setEmbedded] = React.useState(() =>
    typeof window !== "undefined" ? isEmbedMode() : false,
  );
  const scrollRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const on = isEmbedMode();
    setEmbedded(on);
    const root = document.documentElement;
    if (on) {
      root.classList.add("rc-embed");
      document.body.classList.add("rc-embed");
    } else {
      root.classList.remove("rc-embed");
      document.body.classList.remove("rc-embed");
    }
    return () => {
      root.classList.remove("rc-embed");
      document.body.classList.remove("rc-embed");
    };
  }, []);

  // GHL iframe often ignores document scroll — keep an inner scroller + bottom pad.
  if (embedded) {
    return (
      <div
        ref={scrollRef}
        className="rc-embed-scroll h-[100dvh] max-h-[100dvh] overflow-y-auto overscroll-contain bg-background scrollbar-thin"
      >
        <div className="mx-auto w-full max-w-7xl px-4 pb-28 pt-4 sm:px-6 sm:pb-32 lg:px-8">
          {children}
        </div>
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
      <main className={cn("flex-1")}>
        <div className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8">{children}</div>
      </main>
    </div>
  );
}
