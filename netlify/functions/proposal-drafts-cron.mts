/**
 * Netlify's own scheduler for POST /api/v1/workers/proposal-drafts — the Netlify
 * equivalent of vercel.json's crons entry for the same route (see that route's doc
 * comment for why draft_lead_proposal queues instead of drafting inline). Netlify
 * has no vercel.json-style cron config of its own; a scheduled function in this
 * directory, with `config.schedule` set, is how Netlify runs something on an
 * interval, so this calls the worker route instead of requiring a third-party
 * scheduler account (GitHub Actions, cron-job.org, ...) just to keep queued
 * proposal drafts moving.
 *
 * CRON_SECRET is already set in Netlify (Functions + Runtime scope); this reuses it
 * rather than inventing a second secret. Never throws: a scheduled function that
 * throws shows as a failed run in Netlify's UI, which is noise for something that's
 * a no-op whenever nothing is queued — the fetch's own status/body, logged below, is
 * the real signal.
 */
const handler = async () => {
  try {
    const response = await fetch(`${process.env.URL}/api/v1/workers/proposal-drafts`, {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` },
    });
    const body = await response.text();
    console.log("[proposal-drafts-cron] worker responded", { status: response.status, body });
  } catch (error) {
    console.error("[proposal-drafts-cron] fetch to worker route failed", error instanceof Error ? error.message : error);
  }
};

export default handler;
export const config = { schedule: "* * * * *" };
