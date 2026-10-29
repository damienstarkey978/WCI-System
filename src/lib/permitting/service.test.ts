import { describe, expect, it } from "vitest";

import {
  availableTradesToAdd,
  buildPermitReminderEmail,
  catalogInspectionNamesForTrade,
  DEFAULT_INSPECTIONS_ON_ADD,
  DEMO_INSPECTIONS_BY_TRADE,
  STAFF_PERMIT_TRADES,
  tradeLabel,
} from "@/lib/permitting/service";
import { PermitTrade } from "@/generated/prisma/enums";

describe("permitting helpers", () => {
  it("labels trades for display", () => {
    expect(tradeLabel(PermitTrade.ELECTRICAL)).toBe("Electrical");
    expect(tradeLabel(PermitTrade.BUILDING)).toBe("Building");
    expect(tradeLabel(PermitTrade.ROOFING)).toBe("Roofing");
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

  it("defaults electrical to rough, cover-up, and final", () => {
    expect(DEFAULT_INSPECTIONS_ON_ADD.ELECTRICAL).toEqual([
      "Electrical Rough",
      "Electrical Cover-Up",
      "Electrical Final",
    ]);
  });

  it("lists staff-addable trades and excludes ones already on the job", () => {
    expect(STAFF_PERMIT_TRADES).toContain(PermitTrade.ROOFING);
    expect(availableTradesToAdd([PermitTrade.BUILDING, PermitTrade.ELECTRICAL])).toEqual([
      PermitTrade.PLUMBING,
      PermitTrade.MECHANICAL,
      PermitTrade.ROOFING,
    ]);
  });
});
