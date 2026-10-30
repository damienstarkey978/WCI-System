import { describe, expect, it } from "vitest";

import { LeadStage } from "@/generated/prisma/enums";

import { InvalidLeadSheetError, normalizeLeadKey, parseLeadSheet } from "./import";

describe("parseLeadSheet", () => {
  it("reads Buildertrend style headers, money cells and quoted commas", () => {
    const csv = [
      "Title,Client Contact,Email,Phone,Lead Status,Est. Revenue Min,Est. Revenue Max,Confidence,State",
      '"123 Spartina Ave, Kellerman",Pat Kellerman,PAT@Example.com,904-555-0100,Proposal Sent,"$45,000.50","$60,000",35%,fl',
    ].join("\n");
    const [row] = parseLeadSheet(csv);
    expect(row.title).toBe("123 Spartina Ave, Kellerman");
    expect(row.name).toBe("Pat Kellerman");
    expect(row.email).toBe("pat@example.com");
    expect(row.stage).toBe(LeadStage.PROPOSAL_SENT);
    expect(row.estimatedRevenueMinCents).toBe(4_500_050);
    expect(row.estimatedRevenueMaxCents).toBe(6_000_000);
    expect(row.confidencePercent).toBe(35);
    expect(row.state).toBe("FL");
  });

  it("falls back to the title for the contact name and flags unknown statuses", () => {
    const [row] = parseLeadSheet("Title,Status\nBeach house,Thinking about it");
    expect(row.name).toBe("Beach house");
    expect(row.stage).toBe(LeadStage.NEW);
    expect(row.statusUnrecognized).toBe(true);
  });

  it("skips blank rows and rejects a file with no recognizable header", () => {
    expect(parseLeadSheet("Title\nA\n\n,\nB")).toHaveLength(2);
    expect(() => parseLeadSheet("foo,bar\n1,2")).toThrow(InvalidLeadSheetError);
    expect(() => parseLeadSheet("Title\n")).toThrow(InvalidLeadSheetError);
  });
});

describe("normalizeLeadKey", () => {
  it("ignores case and spacing so a re-import matches", () => {
    expect(normalizeLeadKey("  Beach  House ", "x", "A@B.com")).toBe(normalizeLeadKey("beach house", "y", "a@b.com"));
  });

  it("dedupes by name+address when email is missing", () => {
    expect(normalizeLeadKey("Suzanne Singleton — 1747 Debbie Ln", "Suzanne Singleton", null, "1747 Debbie Ln")).toBe(
      normalizeLeadKey("Suzanne Singleton — 1747 Debbie Ln (copy)", "Suzanne  Singleton", null, "1747  Debbie Ln"),
    );
  });
});
