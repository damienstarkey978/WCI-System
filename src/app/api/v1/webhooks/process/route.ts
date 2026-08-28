/**
 * /api/v1/webhooks/process — the seam src/lib/webhooks.ts's own doc comment
 * names: until a real queue (Inngest/Trigger.dev) exists, an external
 * scheduler hits this on an interval to (1) retry any due webhook deliveries
 * and (2) generate the draft invoice for any Draw whose
 * autoGeneratesInvoiceOnDate has come due (CLAUDE.md 2.3).
 *
 * Not gated by withApiAuth — a scheduler call isn't scoped to one
 * organization, so there's no per-org API key to check. Instead it checks a
 * shared CRON_SECRET, matching Vercel Cron's own convention of sending
 * `Authorization: Bearer $CRON_SECRET` (vercel.json's crons array points here);
 * any other scheduler (GitHub Actions, cron-job.org, ...) works the same way
 * as long as it sends that header. Safe to call as often as you like — both
 * steps are no-ops when nothing is due.
 */

import { apiError } from "@/lib/api-auth";
import { db } from "@/lib/db";
import { cronSecret, isCronConfigured } from "@/lib/env";
import {
  DrawAlreadyInvoicedError,
  DrawNotFoundError,
  generateDraftInvoiceForDraw,
  NoBudgetError,
} from "@/lib/invoicing/service";
import { emitEvent, processDueDeliveries } from "@/lib/webhooks";

function isAuthorized(request: Request): boolean {
  if (!isCronConfigured()) return false;
  return request.headers.get("authorization") === `Bearer ${cronSecret()}`;
}

async function runDueTasks() {
  const deliveries = await processDueDeliveries();

  const dueDraws = await db.draw.findMany({
    where: { autoGeneratesInvoiceOnDate: { lte: new Date() }, invoice: null },
    include: { drawSchedule: { select: { organizationId: true } } },
  });

  let invoicesGenerated = 0;
  const invoiceErrors: string[] = [];

  for (const draw of dueDraws) {
    try {
      const invoice = await generateDraftInvoiceForDraw(draw.drawSchedule.organizationId, draw.id);
      await emitEvent(draw.drawSchedule.organizationId, "invoice.created", {
        invoiceId: invoice.id,
        jobId: invoice.jobId,
        drawId: draw.id,
        amountCents: invoice.amountCents,
      });
      invoicesGenerated += 1;
    } catch (error) {
      // A budget that isn't set up yet, or a draw already invoiced by a concurrent
      // run, is an ordinary skip — not a reason to fail the whole batch.
      if (error instanceof DrawNotFoundError || error instanceof DrawAlreadyInvoicedError || error instanceof NoBudgetError) {
        invoiceErrors.push(`${draw.id}: ${error.message}`);
        continue;
      }
      throw error;
    }
  }

  return { webhookDeliveries: deliveries, invoicesGenerated, invoiceErrors };
}

export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return apiError(401, "unauthorized", "Missing or invalid scheduler authorization.");
  }
  return Response.json(await runDueTasks());
}

// Vercel Cron Jobs make GET requests by default.
export async function GET(request: Request) {
  return POST(request);
}
