/**
 * Minimal SMS over Twilio's Messages API. Same optional-integration pattern as
 * src/lib/email/send.ts: throws SmsNotConfiguredError when TWILIO_* is missing
 * so callers never believe a text went out when it did not.
 */

import { transactionalSmsSettings } from "@/lib/env";

export class SmsNotConfiguredError extends Error {
  constructor() {
    super("SMS isn't configured (set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_FROM_NUMBER).");
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

/**
 * Normalize a US-ish phone to E.164 when possible. Leaves already-E.164 alone.
 * Returns null when the input cannot be used as a Twilio `To`.
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

  const auth = Buffer.from(`${settings.accountSid}:${settings.authToken}`).toString("base64");
  const body = new URLSearchParams({ To: to, From: settings.fromNumber, Body: sms.body });

  let response: Response;
  try {
    response = await fetchImpl(
      `https://api.twilio.com/2010-04-01/Accounts/${settings.accountSid}/Messages.json`,
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${auth}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body,
        signal: AbortSignal.timeout(15_000),
      },
    );
  } catch (error) {
    throw new SmsSendError(`Couldn't reach the SMS service: ${error instanceof Error ? error.message : String(error)}`);
  }

  if (!response.ok) {
    let detail = "";
    try {
      const payload = (await response.json()) as { message?: string };
      detail = payload.message ? `: ${payload.message}` : "";
    } catch {
      // status alone
    }
    throw new SmsSendError(`The SMS service rejected the message (HTTP ${response.status})${detail}`);
  }
}
