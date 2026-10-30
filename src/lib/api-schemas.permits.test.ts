import { describe, expect, it } from "vitest";

import {
  createJobPermitSchema,
  createPermitInspectionSchema,
  updateJobPermittingFlagsSchema,
  updatePermitInspectionSchema,
  updatePermitRockstarLedgerSchema,
  updatePermitSchema,
} from "@/lib/api-schemas";

describe("permit API schemas", () => {
  it("requires at least one permit update field", () => {
    expect(updatePermitSchema.safeParse({}).success).toBe(false);
    expect(updatePermitSchema.safeParse({ pulled: true }).success).toBe(true);
    expect(updatePermitSchema.safeParse({ vendorId: null }).success).toBe(true);
  });

  it("requires at least one inspection update field", () => {
    expect(updatePermitInspectionSchema.safeParse({}).success).toBe(false);
    expect(updatePermitInspectionSchema.safeParse({ completed: false }).success).toBe(true);
    expect(
      updatePermitInspectionSchema.safeParse({
        result: "PASS",
        passedAt: "2026-10-29T00:00:00.000Z",
        confirmationNumber: "C-1",
        inspector: "Smith",
      }).success,
    ).toBe(true);
  });

  it("requires at least one permitting flag", () => {
    expect(updateJobPermittingFlagsSchema.safeParse({}).success).toBe(false);
    expect(updateJobPermittingFlagsSchema.safeParse({ nocOnFile: true }).success).toBe(true);
    expect(updateJobPermittingFlagsSchema.safeParse({ buildingPermitDocsCreated: true }).success).toBe(true);
  });

  it("requires at least one Permit Rockstar ledger field", () => {
    expect(updatePermitRockstarLedgerSchema.safeParse({}).success).toBe(false);
    expect(updatePermitRockstarLedgerSchema.safeParse({ privateProvider: true }).success).toBe(true);
    expect(
      updatePermitRockstarLedgerSchema.safeParse({
        setupType: "FLAT_FEE",
        invoiced: true,
        paid: false,
        feePerInspectionCents: 7500,
      }).success,
    ).toBe(true);
    expect(updatePermitRockstarLedgerSchema.safeParse({ setupType: null }).success).toBe(true);
    expect(updatePermitRockstarLedgerSchema.safeParse({ feePerInspectionCents: -1 }).success).toBe(false);
  });

  it("accepts create permit with trade, duplicates, and optional fields", () => {
    expect(createJobPermitSchema.safeParse({}).success).toBe(false);
    expect(createJobPermitSchema.safeParse({ trade: "ELECTRICAL" }).success).toBe(true);
    expect(createJobPermitSchema.safeParse({ trade: "ROOFING", seedDefaultInspections: false }).success).toBe(true);
    expect(createJobPermitSchema.safeParse({ trade: "TEMP_POLE", label: "Temp pole A" }).success).toBe(true);
    expect(
      createJobPermitSchema.safeParse({
        trade: "BUILDING",
        status: "PENDING_PAYMENT",
        jurisdiction: "Duval",
        contractorName: "WCI",
      }).success,
    ).toBe(true);
  });

  it("accepts permit status and dates on update", () => {
    expect(
      updatePermitSchema.safeParse({
        status: "EXPIRED",
        expiresAt: "2026-01-01T00:00:00.000Z",
        jurisdiction: "City of Jacksonville",
      }).success,
    ).toBe(true);
  });

  it("requires inspection name on create", () => {
    expect(createPermitInspectionSchema.safeParse({}).success).toBe(false);
    expect(createPermitInspectionSchema.safeParse({ name: "Electrical Cover-Up" }).success).toBe(true);
  });
});
