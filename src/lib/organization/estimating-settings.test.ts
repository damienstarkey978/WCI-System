import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  db: {
    organization: { findUnique: vi.fn(), update: vi.fn() },
    proposalTemplate: { findFirst: vi.fn() },
  },
}));

import { db } from "@/lib/db";
import {
  DefaultProposalTemplateNotFoundError,
  getEstimatingSettings,
  updateEstimatingSettings,
} from "./estimating-settings";

describe("estimating settings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(db.organization.findUnique).mockResolvedValue({
      id: "org_1",
      defaultEstimateRateMode: "MARKUP",
      defaultEstimateRateBasisPoints: 4_000,
      allowPerLineRateOverride: false,
      defaultTaxRateBasisPoints: 0,
      defaultProposalTerms: "Terms",
      defaultProposalTemplateId: null,
    } as never);
    vi.mocked(db.organization.update).mockResolvedValue({} as never);
  });

  it("returns org estimating defaults", async () => {
    const settings = await getEstimatingSettings("org_1");
    expect(settings.defaultEstimateRateBasisPoints).toBe(4_000);
    expect(settings.defaultTaxRateBasisPoints).toBe(0);
  });

  it("rejects an unknown default proposal template", async () => {
    vi.mocked(db.proposalTemplate.findFirst).mockResolvedValue(null);
    await expect(
      updateEstimatingSettings("org_1", { defaultProposalTemplateId: "tmpl_missing" }),
    ).rejects.toBeInstanceOf(DefaultProposalTemplateNotFoundError);
  });
});
