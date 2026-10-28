import { describe, expect, it } from "vitest";

import { markupBasisPointsFromProposalRow } from "./bt-proposal-markup";

describe("markupBasisPointsFromProposalRow", () => {
  it("does not treat dollar markup as a percent (Candlebark blowup)", () => {
    // BT: Unit Cost 3500, Markup $735 → Client Price 4235 (21%), NOT 735%.
    const bps = markupBasisPointsFromProposalRow({
      Quantity: 1,
      "Unit Cost": 3500,
      "Builder Cost": 3500,
      Markup: 735,
      "Markup Type": "$",
      "Client Price": 4235,
    });
    expect(bps).toBe(2100);
  });

  it("keeps percent markup as percent", () => {
    const bps = markupBasisPointsFromProposalRow({
      Quantity: 1,
      "Unit Cost": 1000,
      "Builder Cost": 1000,
      Markup: 21,
      "Markup Type": "%",
      "Client Price": 1210,
    });
    expect(bps).toBe(2100);
  });

  it("sums Candlebark-style dollar rows to the BT client total, not $824k", () => {
    const cost = 3500;
    const markupDollars = 735;
    const wrongClient = cost * (1 + markupDollars / 100);
    expect(wrongClient).toBe(29225);
    const bps = markupBasisPointsFromProposalRow({
      Quantity: 1,
      "Unit Cost": cost,
      "Builder Cost": cost,
      Markup: markupDollars,
      "Markup Type": "$",
      "Client Price": 4235,
    });
    const rightClient = cost * (1 + bps / 10_000);
    expect(rightClient).toBe(4235);
  });
});
