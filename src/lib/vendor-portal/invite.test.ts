import { describe, expect, it } from "vitest";

import { buildVendorInviteEmail, vendorLoginLink } from "@/lib/vendor-portal/invite";

describe("vendorLoginLink", () => {
  it("builds an absolute link, tolerating a trailing slash and encoding the token", () => {
    expect(vendorLoginLink("https://app.example.com/", "wcivpa_abc.def")).toBe("https://app.example.com/vendor-portal/login?token=wcivpa_abc.def");
    expect(vendorLoginLink("https://app.example.com", "a b")).toBe("https://app.example.com/vendor-portal/login?token=a%20b");
  });
});

describe("buildVendorInviteEmail", () => {
  const base = { vendorName: "A & J Marble", contactName: "Jaime Arismendy", link: "https://x.test/vendor-portal/login?token=t&x=1", companyName: "World Construction Inc" };

  it("greets the contact by first name and includes the link in both bodies", () => {
    const email = buildVendorInviteEmail(base);

    expect(email.text).toContain("Hi Jaime,");
    expect(email.text).toContain(base.link);
    expect(email.html).toContain('href="https://x.test/vendor-portal/login?token=t&amp;x=1"');
    expect(email.subject).toContain("World Construction Inc");
  });

  it("falls back to a plain greeting and escapes the vendor name in HTML", () => {
    const email = buildVendorInviteEmail({ ...base, contactName: null });

    expect(email.text.startsWith("Hello,")).toBe(true);
    expect(email.html).toContain("A &amp; J Marble");
  });
});
