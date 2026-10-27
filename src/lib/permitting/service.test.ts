import { describe, expect, it } from "vitest";

import {
  buildPermitReminderEmail,
  catalogInspectionNamesForTrade,
  DEMO_INSPECTIONS_BY_TRADE,
  tradeLabel,
} from "@/lib/permitting/service";
import { PermitTrade } from "@/generated/prisma/enums";

describe("permitting helpers", () => {
  it("labels trades for display", () => {
    expect(tradeLabel(PermitTrade.ELECTRICAL)).toBe("Electrical");
    expect(tradeLabel(PermitTrade.BUILDING)).toBe("Building");
  });

  it("builds a permit reminder email", () => {
    const message = buildPermitReminderEmail({
      vendorName: "Bright Electric",
      contactName: "Sam Sparks",
      jobName: "Scratch Parity Job",
      trade: "Electrical",
      companyName: "World Construction Inc",
    });
    expect(message.subject).toContain("Electrical permit reminder");
    expect(message.text).toContain("Hi Sam,");
    expect(message.html).toContain("Scratch Parity Job");
  });

  it("exposes a per-trade catalog without auto-attaching every type to a job", () => {
    expect(catalogInspectionNamesForTrade(PermitTrade.BUILDING)).toEqual(DEMO_INSPECTIONS_BY_TRADE.BUILDING);
    expect(catalogInspectionNamesForTrade(PermitTrade.PLUMBING)).toContain("Plumbing Rough");
    expect(catalogInspectionNamesForTrade(PermitTrade.OTHER)).toEqual([]);
  });
});
