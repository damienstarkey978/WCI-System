import { afterEach, describe, expect, it, vi } from "vitest";

import { normalizePhoneE164, SmsNotConfiguredError, SmsSendError, sendSms } from "./send";

describe("normalizePhoneE164", () => {
  it("keeps E.164", () => {
    expect(normalizePhoneE164("+15551234567")).toBe("+15551234567");
  });

  it("adds +1 for 10-digit US numbers", () => {
    expect(normalizePhoneE164("(555) 123-4567")).toBe("+15551234567");
  });

  it("rejects garbage", () => {
    expect(normalizePhoneE164("not-a-phone")).toBeNull();
  });
});

describe("sendSms", () => {
  afterEach(() => {
    delete process.env.TWILIO_ACCOUNT_SID;
    delete process.env.TWILIO_AUTH_TOKEN;
    delete process.env.TWILIO_FROM_NUMBER;
  });

  it("throws when Twilio is not configured", async () => {
    await expect(sendSms({ to: "+15551234567", body: "hi" }, vi.fn() as never)).rejects.toBeInstanceOf(SmsNotConfiguredError);
  });

  it("posts to Twilio Messages", async () => {
    process.env.TWILIO_ACCOUNT_SID = "ACtest";
    process.env.TWILIO_AUTH_TOKEN = "token";
    process.env.TWILIO_FROM_NUMBER = "+15550001111";
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) });

    await sendSms({ to: "5551234567", body: "Your proposal is ready" }, fetchImpl as never);

    expect(fetchImpl).toHaveBeenCalledOnce();
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/Accounts/ACtest/Messages.json");
    expect(String(init.body)).toContain("To=%2B15551234567");
    expect(String(init.body)).toContain("From=%2B15550001111");
  });

  it("surfaces Twilio HTTP errors", async () => {
    process.env.TWILIO_ACCOUNT_SID = "ACtest";
    process.env.TWILIO_AUTH_TOKEN = "token";
    process.env.TWILIO_FROM_NUMBER = "+15550001111";
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ message: "Invalid 'To' phone number" }),
    });

    await expect(sendSms({ to: "+15551234567", body: "hi" }, fetchImpl as never)).rejects.toBeInstanceOf(SmsSendError);
  });
});
