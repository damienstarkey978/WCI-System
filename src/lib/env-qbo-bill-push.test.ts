import { afterEach, describe, expect, it, vi } from "vitest";

describe("isQuickBooksBillPushEnabled", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("defaults to paused when the env var is unset", async () => {
    vi.stubEnv("QBO_BILL_PUSH_ENABLED", "");
    const { isQuickBooksBillPushEnabled } = await import("@/lib/env");
    expect(isQuickBooksBillPushEnabled()).toBe(false);
  });

  it("stays paused for any value other than exact true", async () => {
    vi.stubEnv("QBO_BILL_PUSH_ENABLED", "false");
    let mod = await import("@/lib/env");
    expect(mod.isQuickBooksBillPushEnabled()).toBe(false);

    vi.resetModules();
    vi.stubEnv("QBO_BILL_PUSH_ENABLED", "1");
    mod = await import("@/lib/env");
    expect(mod.isQuickBooksBillPushEnabled()).toBe(false);

    vi.resetModules();
    vi.stubEnv("QBO_BILL_PUSH_ENABLED", "TRUE");
    mod = await import("@/lib/env");
    expect(mod.isQuickBooksBillPushEnabled()).toBe(false);
  });

  it("enables only when exactly true", async () => {
    vi.stubEnv("QBO_BILL_PUSH_ENABLED", "true");
    const { isQuickBooksBillPushEnabled } = await import("@/lib/env");
    expect(isQuickBooksBillPushEnabled()).toBe(true);
  });
});

describe("isQuickBooksInvoicePushEnabled", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("defaults to paused when the env var is unset", async () => {
    vi.stubEnv("QBO_INVOICE_PUSH_ENABLED", "");
    const { isQuickBooksInvoicePushEnabled } = await import("@/lib/env");
    expect(isQuickBooksInvoicePushEnabled()).toBe(false);
  });

  it("stays paused for any value other than exact true", async () => {
    vi.stubEnv("QBO_INVOICE_PUSH_ENABLED", "false");
    let mod = await import("@/lib/env");
    expect(mod.isQuickBooksInvoicePushEnabled()).toBe(false);

    vi.resetModules();
    vi.stubEnv("QBO_INVOICE_PUSH_ENABLED", "1");
    mod = await import("@/lib/env");
    expect(mod.isQuickBooksInvoicePushEnabled()).toBe(false);

    vi.resetModules();
    vi.stubEnv("QBO_INVOICE_PUSH_ENABLED", "TRUE");
    mod = await import("@/lib/env");
    expect(mod.isQuickBooksInvoicePushEnabled()).toBe(false);
  });

  it("enables only when exactly true", async () => {
    vi.stubEnv("QBO_INVOICE_PUSH_ENABLED", "true");
    const { isQuickBooksInvoicePushEnabled } = await import("@/lib/env");
    expect(isQuickBooksInvoicePushEnabled()).toBe(true);
  });
});
