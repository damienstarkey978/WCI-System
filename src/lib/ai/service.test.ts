import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  db: {
    job: { findFirst: vi.fn() },
    costCode: { findMany: vi.fn() },
    materialCatalogItem: { findMany: vi.fn() },
    estimate: { create: vi.fn() },
    client: { findFirst: vi.fn() },
    clientJobAccess: { findFirst: vi.fn() },
  },
}));

vi.mock("@/lib/ai/estimate-assistant", () => ({
  draftEstimateFromNotes: vi.fn(),
}));

vi.mock("@/lib/ai/preference-instructions", () => ({
  listEnabledAiPreferenceInstructions: vi.fn().mockResolvedValue([]),
}));

vi.mock("@/lib/proposals/service", () => ({
  ClientNotFoundError: class ClientNotFoundError extends Error {
    constructor(clientId: string) {
      super(`Client ${clientId} not found`);
      this.name = "ClientNotFoundError";
    }
  },
  createProposal: vi.fn(),
}));

vi.mock("@/lib/change-orders/service", () => ({
  createChangeOrder: vi.fn(),
  JobNotFoundError: class JobNotFoundError extends Error {},
  JobNotOpenError: class JobNotOpenError extends Error {},
}));

import { db } from "@/lib/db";
import { draftEstimateFromNotes } from "@/lib/ai/estimate-assistant";
import { createProposal } from "@/lib/proposals/service";
import { createAiEstimateDraft } from "@/lib/ai/service";

describe("createAiEstimateDraft", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(db.job.findFirst).mockResolvedValue({ id: "job_1", name: "Oak St" } as never);
    vi.mocked(db.costCode.findMany).mockResolvedValue([
      { id: "cc_paint", code: "09-100", name: "Int Paint Labor", defaultCostType: "LABOR" },
    ] as never);
    vi.mocked(db.materialCatalogItem.findMany).mockResolvedValue([] as never);
    vi.mocked(draftEstimateFromNotes).mockResolvedValue({
      title: "Oak St paint",
      projectDescription: "Paint the interior.",
      assumptions: ["Access during weekday hours"],
      lineItems: [
        {
          costCodeId: "cc_paint",
          title: "Interior paint labor",
          description: "Two coats",
          groupLabel: "Painting",
          quantityMilli: 1000,
          unitCostCents: 45000,
          rateMode: "MARKUP",
          rateBasisPoints: 2000,
          confidence: "HIGH",
          priceSource: "CATALOG",
        },
      ],
      proposalSections: [{ title: "Painting", bullets: ["Paint all interior walls, two coats"] }],
    } as never);
    vi.mocked(db.estimate.create).mockResolvedValue({
      id: "est_1",
      title: "Oak St paint",
      lineItems: [{ id: "li_1" }],
    } as never);
  });

  it("creates only an estimate when createProposal is omitted (admin/API path)", async () => {
    const result = await createAiEstimateDraft({
      organizationId: "org_1",
      jobId: "job_1",
      notes: "Paint two bedrooms",
    });

    expect(result.estimateId).toBe("est_1");
    expect(result.proposalId).toBeUndefined();
    expect(createProposal).not.toHaveBeenCalled();
  });

  it("creates a DRAFT proposal with AI narrative when createProposal is true and a client is linked", async () => {
    vi.mocked(db.clientJobAccess.findFirst).mockResolvedValue({ clientId: "client_1" } as never);
    vi.mocked(createProposal).mockResolvedValue({ id: "prop_1" } as never);

    const result = await createAiEstimateDraft({
      organizationId: "org_1",
      jobId: "job_1",
      notes: "Paint two bedrooms",
      createProposal: true,
    });

    expect(result.proposalId).toBe("prop_1");
    expect(createProposal).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: "org_1",
        jobId: "job_1",
        clientId: "client_1",
        coverMessage: "Paint the interior.",
        sections: [{ title: "Painting", bullets: ["Paint all interior walls, two coats"] }],
        options: [{ estimateId: "est_1", label: "Option 1" }],
      }),
    );
  });

  it("skips the proposal with a clear reason when no client is linked", async () => {
    vi.mocked(db.clientJobAccess.findFirst).mockResolvedValue(null as never);

    const result = await createAiEstimateDraft({
      organizationId: "org_1",
      jobId: "job_1",
      notes: "Paint two bedrooms",
      createProposal: true,
    });

    expect(result.estimateId).toBe("est_1");
    expect(result.proposalId).toBeUndefined();
    expect(result.proposalSkippedReason).toMatch(/No client is linked/i);
    expect(createProposal).not.toHaveBeenCalled();
  });
});
