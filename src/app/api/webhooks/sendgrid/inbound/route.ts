/**
 * POST /api/webhooks/sendgrid/inbound — bills forwarded by email.
 *
 * SendGrid Inbound Parse does not sign its requests, so the protection is a shared
 * secret in the URL that SendGrid is configured to call:
 *
 *   https://app.worldconstructionjax.com/api/webhooks/sendgrid/inbound?key=<secret>
 *
 * IP allowlisting is deliberately not used — SendGrid publishes no stable inbound
 * range, so an allowlist would silently start rejecting real mail.
 *
 * The secret is checked before the body is read at all. Nothing about an
 * unauthenticated request is parsed, stored, or sent to the OCR model.
 */

import { timingSafeEqual } from "node:crypto";

import { ingestInboundEmail, type InboundAttachment } from "@/lib/bills/inbound-email";
import { inboundEmailSecret, isInboundEmailConfigured } from "@/lib/env";

/** OCR over several attachments is slow; this is well past a default 10s budget. */
export const maxDuration = 300;

/** Compares without leaking length or position through timing. */
function secretMatches(provided: string | null): boolean {
  const expected = inboundEmailSecret();
  if (!expected || !provided) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.byteLength !== b.byteLength) return false;
  return timingSafeEqual(a, b);
}

/**
 * SendGrid names attachments `attachment1`…`attachmentN` and describes them in an
 * `attachment-info` JSON field. The files themselves are what matter, so they are
 * read straight off the form; attachment-info is consulted only for a better
 * filename when the file part didn't carry one.
 */
async function attachmentsFrom(form: FormData): Promise<InboundAttachment[]> {
  let info: Record<string, { filename?: string; type?: string }> = {};
  const raw = form.get("attachment-info");
  if (typeof raw === "string") {
    try {
      info = JSON.parse(raw);
    } catch {
      // A malformed attachment-info is not worth failing delivery over — the files
      // are present regardless, and they are what becomes a bill.
    }
  }

  const attachments: InboundAttachment[] = [];
  for (const [field, value] of form.entries()) {
    if (!field.startsWith("attachment") || field === "attachment-info" || field === "attachments") continue;
    if (!(value instanceof File) || value.size === 0) continue;

    const described = info[field];
    attachments.push({
      fileName: described?.filename ?? value.name ?? field,
      contentType: described?.type ?? value.type ?? "application/octet-stream",
      bytes: Buffer.from(await value.arrayBuffer()),
    });
  }
  return attachments;
}

/**
 * Falls back to a deterministic id when the provider sends no Message-ID, so a
 * retried delivery of the same mail still collides on the unique index rather than
 * creating a second set of bills.
 */
function messageIdFrom(form: FormData, to: string, from: string, subject: string): string {
  const headers = String(form.get("headers") ?? "");
  const found = /^message-id:\s*(.+)$/im.exec(headers)?.[1]?.trim();
  if (found) return found.slice(0, 500);

  const envelope = String(form.get("envelope") ?? "");
  return `synthetic:${Buffer.from(`${to}|${from}|${subject}|${envelope}`).toString("base64url").slice(0, 400)}`;
}

export async function POST(request: Request): Promise<Response> {
  if (!isInboundEmailConfigured()) {
    // Without a configured secret there is nothing to verify against, so the
    // endpoint refuses everything rather than accepting anything.
    return new Response(null, { status: 401 });
  }

  const key = new URL(request.url).searchParams.get("key");
  if (!secretMatches(key)) {
    // Plain 401, no body: an unauthenticated caller learns nothing about whether the
    // endpoint exists, what it expects, or why it said no.
    return new Response(null, { status: 401 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return Response.json({ error: "Expected multipart/form-data." }, { status: 400 });
  }

  const to = String(form.get("to") ?? "").trim();
  const from = String(form.get("from") ?? "").trim();
  const subject = String(form.get("subject") ?? "").trim();

  if (!to || !from) {
    return Response.json({ error: "Missing to/from." }, { status: 400 });
  }

  try {
    const result = await ingestInboundEmail({
      to,
      from,
      subject: subject || null,
      text: (String(form.get("text") ?? "").trim() || null),
      messageId: messageIdFrom(form, to, from, subject),
      attachments: await attachmentsFrom(form),
    });

    // 200 even when the mail was unroutable or unreadable. It has been recorded and
    // is reviewable; a non-2xx would make SendGrid retry a message that will fail
    // identically every time, and eventually bounce it back at the sender.
    return Response.json({ data: result });
  } catch (error) {
    // A genuine failure on our side — let SendGrid retry, which is what 500 means to it.
    console.error("[sendgrid-inbound] failed to ingest", error);
    return Response.json({ error: "Could not process this message." }, { status: 500 });
  }
}
