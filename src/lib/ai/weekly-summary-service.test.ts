import { describe, expect, it } from "vitest";

import { buildClientUpdateEmail } from "@/lib/ai/weekly-summary-service";

describe("buildClientUpdateEmail", () => {
  it("builds subject and text for the primary client", () => {
    const message = buildClientUpdateEmail({
      clientName: "Alex Homeowner",
      jobName: "Scratch Parity Job",
      companyName: "World Construction Inc",
      headline: "Framing wrapped up",
      body: "The crew finished the second floor walls this week.",
      highlights: ["Framing complete", "Electrical next"],
      periodStart: new Date("2026-10-19T00:00:00Z"),
      periodEnd: new Date("2026-10-26T00:00:00Z"),
    });

    expect(message.subject).toBe("World Construction Inc: Scratch Parity Job progress update");
    expect(message.text).toContain("Hi Alex,");
    expect(message.text).toContain("Framing wrapped up");
    expect(message.text).toContain("• Framing complete");
    expect(message.html).toContain("<strong>Framing wrapped up</strong>");
    expect(message.html).toContain("<li>Electrical next</li>");
  });
});
