import { describe, expect, it } from "vitest";

import {
  availableTradesToAdd,
  buildPermitReminderEmail,
  catalogInspectionNamesForTrade,
  DEFAULT_INSPECTIONS_ON_ADD,
  DEMO_INSPECTIONS_BY_TRADE,
  hasActiveBuildingPermit,
  hasBuildingPermitDocs,
  permitRockstarLedgerFromJob,
  STAFF_PERMIT_TRADES,
  tradeLabel,
} from "@/lib/permitting/service";
import { PermitRockstarSetupType, PermitStatus, PermitTrade } from "@/generated/prisma/enums";

describe("permitting helpers", () => {
  it("labels trades for display", () => {
    expect(tradeLabel(PermitTrade.ELECTRICAL)).toBe("Electrical");
    expect(tradeLabel(PermitTrade.BUILDING)).toBe("Building");
    expect(tradeLabel(PermitTrade.ROOFING)).toBe("Roofing");
    expect(tradeLabel(PermitTrade.TEMP_POLE)).toBe("Temp pole");
    expect(tradeLabel(PermitTrade.SITE)).toBe("Site");
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
    expect(DEMO_INSPECTIONS_BY_TRADE.ROOFING).toContain("Roof Sheathing");
  });

  it("defaults electrical to rough, cover-up, and final", () => {
    expect(DEFAULT_INSPECTIONS_ON_ADD.ELECTRICAL).toEqual([
      "Electrical Rough",
      "Electrical Cover-Up",
      "Electrical Final",
    ]);
  });

  it("does not auto-seed Roof Sheathing on roofing permits", () => {
    expect(DEFAULT_INSPECTIONS_ON_ADD.ROOFING).toEqual(["Roof Final"]);
    expect(DEFAULT_INSPECTIONS_ON_ADD.ROOFING).not.toContain("Roof Sheathing");
  });

  it("always offers the full staff trade catalog (duplicates allowed)", () => {
    expect(STAFF_PERMIT_TRADES).toContain(PermitTrade.ROOFING);
    expect(STAFF_PERMIT_TRADES).toContain(PermitTrade.TEMP_POLE);
    expect(STAFF_PERMIT_TRADES).toContain(PermitTrade.SITE);
    expect(availableTradesToAdd([PermitTrade.BUILDING, PermitTrade.ELECTRICAL])).toEqual([
      ...STAFF_PERMIT_TRADES,
    ]);
  });

  it("treats docs created only when a timestamp is set", () => {
    expect(hasBuildingPermitDocs(null)).toBe(false);
    expect(hasBuildingPermitDocs(new Date())).toBe(true);
  });

  it("treats active permit as building ACTIVE/pulled, not MEP alone", () => {
    expect(
      hasActiveBuildingPermit([
        { trade: PermitTrade.ELECTRICAL, pulled: true, permitNumber: null, status: PermitStatus.ACTIVE },
      ]),
    ).toBe(false);
    expect(
      hasActiveBuildingPermit([
        { trade: PermitTrade.BUILDING, pulled: false, permitNumber: "X", status: PermitStatus.DRAFT },
        { trade: PermitTrade.ELECTRICAL, pulled: true, permitNumber: null, status: PermitStatus.ACTIVE },
      ]),
    ).toBe(false);
    expect(
      hasActiveBuildingPermit([
        { trade: PermitTrade.BUILDING, pulled: true, permitNumber: "X", status: PermitStatus.ACTIVE },
      ]),
    ).toBe(true);
    expect(
      hasActiveBuildingPermit([
        { trade: PermitTrade.BUILDING, pulled: false, permitNumber: "X", status: PermitStatus.EXPIRED },
      ]),
    ).toBe(false);
  });

  it("maps job columns onto a Permit Rockstar ledger shape", () => {
    expect(
      permitRockstarLedgerFromJob({
        permitRockstarPrivateProvider: true,
        permitRockstarSetupType: PermitRockstarSetupType.CARD_ON_FILE,
        permitRockstarInvoiced: true,
        permitRockstarPaid: false,
        permitRockstarFeePerInspectionCents: 12_500,
      }),
    ).toEqual({
      privateProvider: true,
      setupType: PermitRockstarSetupType.CARD_ON_FILE,
      invoiced: true,
      paid: false,
      feePerInspectionCents: 12_500,
    });
  });
});
