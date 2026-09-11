/**
 * Inbound bill email: resolving a recipient address, and turning one delivered
 * message into bills in the Inbox queue.
 *
 * The provider-specific shape (SendGrid's multipart Inbound Parse body) is parsed in
 * the route; everything here works on a plain object, so the routing rules and the
 * ingestion are testable without constructing a webhook request, and swapping
 * providers later touches the route only.
 */

import { db } from "@/lib/db";
import { createBillFromOcr } from "@/lib/ai/bill-ocr-service";
import type { BillOcrDocumentInput } from "@/lib/ai/bill-ocr-assistant";
import { imageFingerprint, rejectionReason } from "@/lib/ai/image-probe";
import { JOB_FILES_BUCKET, uploadJobFile } from "@/lib/storage/supabase-storage";

/** What Claude's vision API accepts. Anything else is recorded and skipped, not guessed at. */
/**
 * The vision API stamps every response with a request id. When a file is refused,
 * that id is the only handle on the failure that Anthropic can look up — so it goes
 * in the note next to the file's own fingerprint.
 */
function requestIdOf(error: unknown): string {
  const id = (error as { request_id?: unknown } | null)?.request_id;
  return typeof id === "string" && id.length > 0 ? ` [request ${id}]` : "";
}

const ACCEPTED: Record<string, BillOcrDocumentInput["mediaType"]> = {
  "image/png": "image/png",
  "image/jpeg": "image/jpeg",
  "image/jpg": "image/jpeg",
  "image/gif": "image/gif",
  "image/webp": "image/webp",
  "application/pdf": "application/pdf",
};

/** One attachment's worth of ceiling. A vendor invoice PDF is far below this. */
export const MAX_ATTACHMENT_BYTES = 15 * 1024 * 1024;

export interface InboundAttachment {
  readonly fileName: string;
  readonly contentType: string;
  readonly bytes: Buffer;
}

export interface InboundMessage {
  readonly to: string;
  readonly from: string;
  readonly subject: string | null;
  readonly text: string | null;
  readonly messageId: string;
  readonly attachments: readonly InboundAttachment[];
}

export interface RoutingResult {
  readonly organizationId: string | null;
  readonly jobId: string | null;
  readonly note: string | null;
}

/**
 * Pull the local part out of whatever the provider put in `to`. That field can be a
 * bare address, a display-name form (`"AP" <bills-x@…>`), or several recipients
 * comma-separated when the mail was also sent elsewhere — so each candidate is tried
 * and the first that looks like one of ours wins.
 */
export function billsLocalPartsFrom(toField: string): readonly string[] {
  return toField
    .split(",")
    .map((entry) => {
      const angled = /<([^>]+)>/.exec(entry);
      return (angled ? angled[1] : entry).trim().toLowerCase();
    })
    .map((address) => /^bills-([a-z0-9-]+)@/.exec(address)?.[1])
    .filter((slug): slug is string => Boolean(slug));
}

/**
 * Resolve `bills-{orgSlug}` or `bills-{orgSlug}-{jobPrefix}` to an org and job.
 *
 * Both an org slug and a job prefix can contain hyphens, so where the boundary falls
 * is genuinely ambiguous from the string alone — "bills-world-construction-283rc"
 * could split four ways. Rather than guess, every split is tried against the
 * database, longest org slug first, and the whole string is tried as an org slug
 * before any of them. A job-level address therefore never shadows an organization
 * whose slug happens to end in something prefix-shaped.
 */
export async function routeInboundAddress(toField: string): Promise<RoutingResult> {
  const candidates = billsLocalPartsFrom(toField);
  if (candidates.length === 0) {
    return { organizationId: null, jobId: null, note: `No bills-* address in "${toField}".` };
  }

  for (const candidate of candidates) {
    const wholeIsOrg = await db.organization.findUnique({ where: { slug: candidate }, select: { id: true } });
    if (wholeIsOrg) return { organizationId: wholeIsOrg.id, jobId: null, note: null };

    const parts = candidate.split("-");
    for (let cut = parts.length - 1; cut >= 1; cut--) {
      const orgSlug = parts.slice(0, cut).join("-");
      const jobPrefix = parts.slice(cut).join("-");

      const org = await db.organization.findUnique({ where: { slug: orgSlug }, select: { id: true } });
      if (!org) continue;

      const job = await db.job.findFirst({
        where: { organizationId: org.id, prefix: { equals: jobPrefix, mode: "insensitive" } },
        select: { id: true },
      });
      if (job) return { organizationId: org.id, jobId: job.id, note: null };

      // The org half matched but the job half didn't. That is a typo in a real
      // address, not a different organization — say so instead of searching on.
      return {
        organizationId: org.id,
        jobId: null,
        note: `No job with prefix "${jobPrefix}". Filed against the organization; assign it to a job by hand.`,
      };
    }
  }

  return {
    organizationId: null,
    jobId: null,
    note: `No organization matches "${candidates[0]}". Check the address the sender used.`,
  };
}

/** The job an org-level email lands on when the address named no job. */
async function fallbackJobId(organizationId: string): Promise<string | null> {
  const job = await db.job.findFirst({
    where: { organizationId, status: "OPEN", isTemplate: false },
    orderBy: { updatedAt: "desc" },
    select: { id: true },
  });
  return job?.id ?? null;
}

export interface IngestResult {
  readonly inboundEmailId: string;
  readonly status: "ROUTED" | "UNROUTED" | "FAILED";
  readonly billsCreated: number;
  readonly duplicate: boolean;
  readonly note: string | null;
}

/**
 * Take one delivered message and land its attachments in the Bills Inbox.
 *
 * Two things this deliberately does not do. It does not build a second bill-creation
 * path — every attachment goes through createBillFromOcr(), the same call the
 * drag-and-drop upload makes. And it never moves a bill past INBOX: an emailed bill
 * arrived unattended, so unlike an upload (where a human at least chose the file),
 * nobody has yet confirmed it is a bill, for this job, for this amount. INBOX is
 * excluded from actual cost in the funnel precisely so that unread mail can't move a
 * job's numbers.
 */
export async function ingestInboundEmail(message: InboundMessage): Promise<IngestResult> {
  // SendGrid retries anything that isn't a 2xx, so the same message can arrive more
  // than once. Recognise it rather than creating a second set of bills.
  const existing = await db.inboundEmail.findUnique({
    where: { messageId: message.messageId },
    select: {
      id: true,
      status: true,
      note: true,
      processedAt: true,
      bills: { select: { title: true } },
      _count: { select: { bills: true } },
    },
  });

  // Only a message seen through to an outcome counts as a duplicate. Reading several
  // attachments can take longer than the request that started it, and if that first
  // attempt died part-way — a timeout, a redeploy, a crash — the row is already here
  // with processedAt still null. Calling the retry a duplicate then would file the
  // email as handled and silently drop every bill in it, which is the worst outcome
  // available for mail nobody is watching. So an unfinished attempt is resumed.
  if (existing?.processedAt) {
    return {
      inboundEmailId: existing.id,
      status: existing.status as IngestResult["status"],
      billsCreated: existing._count.bills,
      duplicate: true,
      note: existing.note,
    };
  }

  const routing = await routeInboundAddress(message.to);

  const record = existing ?? await db.inboundEmail.create({
    data: {
      organizationId: routing.organizationId,
      jobId: routing.jobId,
      status: "UNROUTED",
      toAddress: message.to.slice(0, 500),
      fromAddress: message.from.slice(0, 500),
      subject: message.subject?.slice(0, 500) ?? null,
      messageId: message.messageId,
      textBody: message.text?.slice(0, 10_000) ?? null,
      attachmentCount: message.attachments.length,
      note: routing.note,
    },
  });

  if (!routing.organizationId) {
    // Nowhere to file it, so keep the attachments themselves — someone mistyped an
    // address and is waiting for their bill to turn up.
    const storedPaths = await keepForTriage(record.id, message.attachments);
    await db.inboundEmail.update({
      where: { id: record.id },
      data: { storedPaths, processedAt: new Date() },
    });
    return {
      inboundEmailId: record.id,
      status: "UNROUTED",
      billsCreated: 0,
      duplicate: false,
      note: routing.note,
    };
  }

  const jobId = routing.jobId ?? (await fallbackJobId(routing.organizationId));
  if (!jobId) {
    const note = "No open job to file this against. Create one, then re-process this email.";
    await db.inboundEmail.update({
      where: { id: record.id },
      data: { status: "FAILED", note, processedAt: new Date() },
    });
    return { inboundEmailId: record.id, status: "FAILED", billsCreated: 0, duplicate: false, note };
  }

  // On a resumed attempt the note already carries the routing note and whatever the
  // first pass managed to say about each attachment, so it is kept rather than
  // rewritten — the point of resuming is not to lose what was already learned.
  const notes: string[] = existing?.note ? [existing.note] : routing.note ? [routing.note] : [];

  // A bill is titled with the attachment it came from, which is what makes a resumed
  // attempt able to tell what it already did. Without this a retry would read every
  // attachment again and file a second copy of each bill the first pass created.
  const alreadyBilled = new Set(
    (existing?.bills ?? []).map((bill) => bill.title).filter((title): title is string => Boolean(title)),
  );
  let created = existing?._count.bills ?? 0;

  for (const attachment of message.attachments) {
    if (alreadyBilled.has(attachment.fileName)) continue;

    const mediaType = ACCEPTED[attachment.contentType.toLowerCase().split(";")[0].trim()];
    if (!mediaType) {
      notes.push(`Skipped ${attachment.fileName}: ${attachment.contentType || "unknown type"} can't be read.`);
      continue;
    }
    if (attachment.bytes.byteLength > MAX_ATTACHMENT_BYTES) {
      notes.push(`Skipped ${attachment.fileName}: larger than ${MAX_ATTACHMENT_BYTES / 1024 / 1024}MB.`);
      continue;
    }

    // Check the bytes before spending an API call on them. The vision API's refusal
    // is a bare "Could not process image", which is indistinguishable between an
    // oversized receipt, a mislabelled file and a corrupt one — and leaves whoever
    // forwarded it with nothing to act on.
    const reason = rejectionReason(attachment.bytes, attachment.contentType);
    if (reason) {
      notes.push(`Skipped ${attachment.fileName} (${imageFingerprint(attachment.bytes)}): ${reason}.`);
      continue;
    }

    try {
      const { bill } = await createBillFromOcr({
        organizationId: routing.organizationId,
        jobId,
        document: { data: attachment.bytes.toString("base64"), mediaType },
      });

      await db.bill.update({
        where: { id: bill.id },
        data: {
          // Straight to INBOX, never past it — see this function's comment.
          approvalStatus: "INBOX",
          source: "EMAIL",
          title: attachment.fileName,
          inboundEmailId: record.id,
          sourceEmailFrom: message.from.slice(0, 500),
          sourceEmailSubject: message.subject?.slice(0, 500) ?? null,
          sourceEmailMessageId: message.messageId,
        },
      });
      created += 1;
    } catch (error) {
      // Include what was sent, down to a hash of the exact bytes. Without it the
      // recorded note is the API's opaque message and nothing about the file it
      // refused — and the first question when a file fails here but opens fine on
      // someone's desk is whether the bytes that arrived are the bytes they sent.
      notes.push(
        `Could not read ${attachment.fileName} (${imageFingerprint(attachment.bytes)}): ` +
          `${error instanceof Error ? error.message : "unknown error"}${requestIdOf(error)}`,
      );
    }
  }

  if (created === 0 && message.attachments.length === 0) {
    notes.push("The email had no attachments. Only attached receipts and invoices become bills.");
  }

  // Routed even when nothing could be read: the email reached the right organization,
  // and the note says what happened to each attachment.
  const status = created > 0 || message.attachments.length === 0 ? "ROUTED" : "FAILED";
  const note = notes.length > 0 ? notes.join(" ") : null;

  await db.inboundEmail.update({
    where: { id: record.id },
    data: { status, jobId, note, processedAt: new Date() },
  });

  return { inboundEmailId: record.id, status, billsCreated: created, duplicate: false, note };
}

/**
 * Park an unroutable email's attachments in storage so they aren't lost. Best effort:
 * if storage isn't configured or the upload fails, the email itself is still on
 * record with its sender and subject, which is enough to go back to the sender.
 */
async function keepForTriage(
  inboundEmailId: string,
  attachments: readonly InboundAttachment[],
): Promise<string[]> {
  const paths: string[] = [];
  for (const [index, attachment] of attachments.entries()) {
    const safeName = attachment.fileName.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-120);
    const path = `inbound-unrouted/${inboundEmailId}/${index}-${safeName}`;
    try {
      await uploadJobFile(path, attachment.bytes, attachment.contentType);
      paths.push(`${JOB_FILES_BUCKET}/${path}`);
    } catch {
      // Deliberately swallowed — see above.
    }
  }
  return paths;
}
