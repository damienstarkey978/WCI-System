import { describe, expect, it } from "vitest";

import {
  createJobPermitSchema,
  createPermitInspectionSchema,
  updateJobPermittingFlagsSchema,
  updatePermitInspectionSchema,
  updatePermitSchema,
} from "@/lib/api-schemas";

describe("permit API schemas", () => {
  it("requires at least one permit update field", () => {
    expect(updatePermitSchema.safeParse({}).success).toBe(false);
    expect(updatePermitSchema.safeParse({ pulled: true }).success).toBe(true);
    expect(updatePermitSchema.safeParse({ vendorId: null }).success).toBe(true);
  });

  it("requires completed on inspection updates", () => {
    expect(updatePermitInspectionSchema.safeParse({}).success).toBe(false);
    expect(updatePermitInspectionSchema.safeParse({ completed: false }).success).toBe(true);
  });

  it("requires at least one permitting flag", () => {
    expect(updateJobPermittingFlagsSchema.safeParse({}).success).toBe(false);
    expect(updateJobPermittingFlagsSchema.safeParse({ nocOnFile: true }).success).toBe(true);
  });

  it("accepts create permit with trade and optional seed flag", () => {
    expect(createJobPermitSchema.safeParse({}).success).toBe(false);
    expect(createJobPermitSchema.safeParse({ trade: "ELECTRICAL" }).success).toBe(true);
    expect(createJobPermitSchema.safeParse({ trade: "ROOFING", seedDefaultInspections: false }).success).toBe(true);
  });

  it("requires inspection name on create", () => {
    expect(createPermitInspectionSchema.safeParse({}).success).toBe(false);
    expect(createPermitInspectionSchema.safeParse({ name: "Electrical Cover-Up" }).success).toBe(true);
  });
});
