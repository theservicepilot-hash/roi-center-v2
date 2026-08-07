"use client";

import { CircleAlert, Megaphone, Tags, Workflow } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const NOTES = [
  {
    icon: Megaphone,
    title: "Connect ads in GoHighLevel",
    body: "Facebook and Google spend come from GHL Ad Publishing. In this location, connect Meta and/or Google under Ads / Ad Publishing first. If those integrations are missing, Sync will not show real spend.",
  },
  {
    icon: Workflow,
    title: "Pick a CRM pipeline for returns",
    body: "Won revenue, open pipeline, and ROAS use opportunities from one GHL pipeline. Select that pipeline below, then Save & sync so we cache those opportunities.",
  },
  {
    icon: Tags,
    title: "Tag opportunity sources",
    body: 'Each opportunity needs a source such as "fb lead", "Facebook", "google lead", or "Google". We map those to Facebook / Google / Other so channel ROAS (and Overview) stay accurate. Untagged opps count as Other.',
  },
] as const;

/** How spend + CRM opportunities combine into ROAS on this dashboard. */
export function RoiSetupNotes() {
  return (
    <Card className="border-border/80 bg-muted/25">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <CircleAlert className="size-4 text-primary" />
          How accurate ROI data works
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Spend, pipeline returns, and source tags must all be in place. ROAS = won
          opportunity revenue ÷ ad spend for the selected range.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        <ol className="space-y-3">
          {NOTES.map((note, i) => (
            <li key={note.title} className="flex gap-3">
              <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-xs font-semibold text-primary">
                {i + 1}
              </span>
              <div className="min-w-0 space-y-0.5">
                <p className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                  <note.icon className="size-3.5 shrink-0 text-muted-foreground" />
                  {note.title}
                </p>
                <p className="text-xs leading-relaxed text-muted-foreground">
                  {note.body}
                </p>
              </div>
            </li>
          ))}
        </ol>
        <p className="rounded-lg border border-border/70 bg-background/80 px-3 py-2 text-xs text-muted-foreground">
          <span className="font-medium text-foreground">Tip:</span> After connecting
          ads and tagging sources, use <span className="font-medium text-foreground">Sync</span>{" "}
          for spend, then pipeline <span className="font-medium text-foreground">Save &amp; sync</span>{" "}
          for opportunities. Empty $0 cards usually mean one of the steps above is missing.
        </p>
      </CardContent>
    </Card>
  );
}
