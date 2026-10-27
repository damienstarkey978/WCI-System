import { afterEach, describe, expect, it, vi } from "vitest";

import { normalizePhoneE164, QUO_API_VERSION, SmsNotConfiguredError, SmsSendError, sendSms } from "./send";

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

describe("sendSms (Quo)", () => {
  afterEach(() => {
    delete process.env.QUO_API_KEY;
    delete process.env.QUO_FROM_NUMBER;
  });

  it("throws when Quo is not configured", async () => {
    await expect(sendSms({ to: "+15551234567", body: "hi" }, vi.fn() as never)).rejects.toBeInstanceOf(SmsNotConfiguredError);
  });

  it("posts to Quo Messages with raw API key auth", async () => {
    process.env.QUO_API_KEY = "quo_test_key";
    process.env.QUO_FROM_NUMBER = "+15550001111";
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, status: 202, json: async () => ({}) });

    await sendSms({ to: "5551234567", body: "Your proposal is ready" }, fetchImpl as never);

    expect(fetchImpl).toHaveBeenCalledOnce();
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.quo.com/v1/messages");
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe("quo_test_key");
    expect(headers["Quo-Api-Version"]).toBe(QUO_API_VERSION);
    expect(JSON.parse(String(init.body))).toEqual({
      content: "Your proposal is ready",
      from: "+15550001111",
      to: ["+15551234567"],
    });
  });

  it("surfaces Quo HTTP errors", async () => {
    process.env.QUO_API_KEY = "quo_test_key";
    process.env.QUO_FROM_NUMBER = "+15550001111";
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ title: "A2P Registration Not Approved" }),
    });

    await expect(sendSms({ to: "+15551234567", body: "hi" }, fetchImpl as never)).rejects.toBeInstanceOf(SmsSendError);
  });
});
