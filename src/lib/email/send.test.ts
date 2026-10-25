import { afterEach, describe, expect, it, vi } from "vitest";

import { EmailNotConfiguredError, EmailSendError, sendEmail } from "@/lib/email/send";

const MESSAGE = { to: "sub@example.com", subject: "Hi", text: "Hello" };

describe("sendEmail", () => {
  afterEach(() => {
    delete process.env.EMAIL_PROVIDER_API_KEY;
    delete process.env.EMAIL_FROM;
  });

  it("throws instead of pretending to send when email isn't configured", async () => {
    const fetchImpl = vi.fn();

    await expect(sendEmail(MESSAGE, fetchImpl as never)).rejects.toBeInstanceOf(EmailNotConfiguredError);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("posts to Resend with the key, sender and recipient", async () => {
    process.env.EMAIL_PROVIDER_API_KEY = "re_test";
    process.env.EMAIL_FROM = "WCI <office@example.com>";
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true });

    await sendEmail({ ...MESSAGE, html: "<p>Hello</p>", replyTo: "office@example.com" }, fetchImpl as never);

    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe("https://api.resend.com/emails");
    expect(init.headers.Authorization).toBe("Bearer re_test");
    expect(JSON.parse(init.body)).toMatchObject({ from: "WCI <office@example.com>", to: ["sub@example.com"], subject: "Hi", html: "<p>Hello</p>", reply_to: "office@example.com" });
  });

  it("surfaces the provider's error message on a rejected send", async () => {
    process.env.EMAIL_PROVIDER_API_KEY = "re_test";
    process.env.EMAIL_FROM = "WCI <office@example.com>";
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 403, json: async () => ({ message: "domain not verified" }) });

    await expect(sendEmail(MESSAGE, fetchImpl as never)).rejects.toThrow(/HTTP 403.*domain not verified/);
  });

  it("wraps a network failure", async () => {
    process.env.EMAIL_PROVIDER_API_KEY = "re_test";
    process.env.EMAIL_FROM = "WCI <office@example.com>";
    const fetchImpl = vi.fn().mockRejectedValue(new Error("socket hang up"));

    await expect(sendEmail(MESSAGE, fetchImpl as never)).rejects.toBeInstanceOf(EmailSendError);
  });
});
