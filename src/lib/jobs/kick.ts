import { after } from "next/server";

import { processJobQueue } from "@/lib/jobs/runner";

/**
 * Kick the DB job queue after the HTTP response (Vercel/Node).
 * No external worker — cron also drains the same queue.
 */
export function kickJobQueue(limit = 2) {
  try {
    after(async () => {
      try {
        await processJobQueue(limit);
      } catch (e) {
        console.error("kickJobQueue failed", e);
      }
    });
  } catch (e) {
    // after() unavailable in some contexts — cron will pick jobs up
    console.warn("after() unavailable; jobs wait for cron", e);
  }
}
