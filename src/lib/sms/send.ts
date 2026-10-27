/**
 * Transactional SMS via Quo (formerly OpenPhone).
 * Same optional-integration pattern as src/lib/email/send.ts: throws
 * SmsNotConfiguredError when QUO_* is missing so callers never believe a text
 * went out when it did not.
 *
 * Auth: Authorization header is the raw API key (not Bearer).
 * Docs: https://www.quo.com/docs/mdx/api-reference/messages/send-a-text-message
 */

import { transactionalSmsSettings } from "@/lib/env";

export class SmsNotConfiguredError extends Error {
  constructor() {
    super("SMS isn't configured (set QUO_API_KEY and QUO_FROM_NUMBER).");
    this.name = "SmsNotConfiguredError";
  }
}

export class SmsSendError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SmsSendError";
  }
}

export interface OutgoingSms {
  readonly to: string;
  readonly body: string;
}

/** Quo API version header required on every request (no default). */
export const QUO_API_VERSION = "2026-03-30";
const QUO_MESSAGES_ENDPOINT = "https://api.quo.com/v1/messages";

/**
 * Normalize a US-ish phone to E.164 when possible. Leaves already-E.164 alone.
 * Returns null when the input cannot be used as a Quo `to`.
 */
export function normalizePhoneE164(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (/^\+[1-9]\d{7,14}$/.test(trimmed)) return trimmed;
  const digits = trimmed.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return null;
}

export async function sendSms(sms: OutgoingSms, fetchImpl: typeof fetch = fetch): Promise<void> {
  const settings = transactionalSmsSettings();
  if (!settings) throw new SmsNotConfiguredError();

  const to = normalizePhoneE164(sms.to);
  if (!to) throw new SmsSendError(`"${sms.to}" doesn't look like a phone number we can text.`);

  const from = normalizePhoneE164(settings.fromNumber) ?? settings.fromNumber.trim();
  if (!from) throw new SmsNotConfiguredError();

  let response: Response;
  try {
    response = await fetchImpl(QUO_MESSAGES_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: settings.apiKey,
        "Quo-Api-Version": QUO_API_VERSION,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        content: sms.body,
        from,
        to: [to],
      }),
      signal: AbortSignal.timeout(15_000),
    });
  } catch (error) {
    throw new SmsSendError(`Couldn't reach Quo: ${error instanceof Error ? error.message : String(error)}`);
  }

  // Quo documents 202 Success for send; accept any 2xx.
  if (!response.ok) {
    let detail = "";
    try {
      const payload = (await response.json()) as { message?: string; title?: string };
      const msg = payload.message ?? payload.title;
      detail = msg ? `: ${msg}` : "";
    } catch {
      // status alone
    }
    throw new SmsSendError(`Quo rejected the message (HTTP ${response.status})${detail}`);
  }
}
