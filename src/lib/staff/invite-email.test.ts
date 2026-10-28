import { describe, expect, it } from "vitest";

import { buildStaffInviteEmail, staffSignInUrl, staffSignUpUrl } from "@/lib/staff/invite-email";

describe("staff invite email", () => {
  it("builds sign-in and sign-up URLs without trailing slash doubling", () => {
    expect(staffSignInUrl("https://app.example.com/")).toBe("https://app.example.com/sign-in");
    expect(staffSignUpUrl("https://app.example.com")).toBe("https://app.example.com/sign-up");
  });

  it("includes the recipient email and both auth URLs in the body", () => {
    const message = buildStaffInviteEmail({
      recipientName: "Heather Lawrence",
      email: "office@worldconstructioninc.com",
      companyName: "World Construction Inc",
      signInUrl: "https://app.example.com/sign-in",
      signUpUrl: "https://app.example.com/sign-up",
    });

    expect(message.subject).toContain("World Construction Inc");
    expect(message.text).toContain("Hi Heather,");
    expect(message.text).toContain("office@worldconstructioninc.com");
    expect(message.text).toContain("https://app.example.com/sign-in");
    expect(message.text).toContain("https://app.example.com/sign-up");
    expect(message.html).toContain('href="https://app.example.com/sign-in"');
    expect(message.html).toContain("no separate WCI OS password");
  });
});
