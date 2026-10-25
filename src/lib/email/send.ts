/**
 * Minimal transactional email over Resend's HTTP API. Deliberately tiny: one function,
 * no templates, no queue. Callers must check isTransactionalEmailConfigured() first
 * when they want to fall back to something else — sendEmail itself throws if it isn't
 * configured, so a caller can never believe a message went out when it didn't.
 */

import { transactionalEmailSettings } from "@/lib/env";

export class EmailNotConfiguredError extends Error {
  constructor() {
    super("Email isn't configured (set EMAIL_PROVIDER_API_KEY and EMAIL_FROM).");
    this.name = "EmailNotConfiguredError";
  }
}

export class EmailSendError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EmailSendError";
  }
}

export interface OutgoingEmail {
  readonly to: string;
  readonly subject: string;
  readonly text: string;
  readonly html?: string;
  readonly replyTo?: string;
}

const RESEND_ENDPOINT = "https://api.resend.com/emails";

export async function sendEmail(email: OutgoingEmail, fetchImpl: typeof fetch = fetch): Promise<void> {
  const settings = transactionalEmailSettings();
  if (!settings) throw new EmailNotConfiguredError();

  let response: Response;
  try {
    response = await fetchImpl(RESEND_ENDPOINT, {
      method: "POST",
      headers: { Authorization: `Bearer ${settings.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: settings.from,
        to: [email.to],
        subject: email.subject,
        text: email.text,
        ...(email.html ? { html: email.html } : {}),
        ...(email.replyTo ? { reply_to: email.replyTo } : {}),
      }),
      signal: AbortSignal.timeout(15_000),
    });
  } catch (error) {
    throw new EmailSendError(`Couldn't reach the email service: ${error instanceof Error ? error.message : String(error)}`);
  }

  if (!response.ok) {
    let detail = "";
    try {
      const body = (await response.json()) as { message?: string };
      detail = body.message ? `: ${body.message}` : "";
    } catch {
      // Non-JSON error body — the status code alone will have to do.
    }
    throw new EmailSendError(`The email service rejected the message (HTTP ${response.status})${detail}`);
  }
}
