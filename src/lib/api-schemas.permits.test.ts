import { describe, expect, it } from "vitest";

import {
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
});
