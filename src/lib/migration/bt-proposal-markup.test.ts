import { describe, expect, it } from "vitest";

import { markupBasisPointsFromProposalRow } from "./bt-proposal-markup";

describe("markupBasisPointsFromProposalRow", () => {
  it("does not treat dollar markup as a percent (Candlebark blowup)", () => {
    // cost $3,500 + markup $735 → client $4,235 (21%)
    const bps = markupBasisPointsFromProposalRow({
      "Builder Cost": 3500,
      Markup: 735,
      "Markup Type": "$",
      "Client Price": 4235,
    });
    expect(bps).toBe(2100);
  });

  it("keeps percent markup as percent", () => {
    expect(
      markupBasisPointsFromProposalRow({
        "Builder Cost": 1000,
        Markup: 20,
        "Markup Type": "%",
        "Client Price": 1200,
      }),
    ).toBe(2000);
  });

  it("sums Candlebark-style dollar rows to the BT client total, not $824k", () => {
    const rows = [
      { "Builder Cost": 3500, Markup: 735, "Markup Type": "$", "Client Price": 4235 },
      { "Builder Cost": 1000, Markup: 210, "Markup Type": "$", "Client Price": 1210 },
    ];
    let client = 0;
    for (const row of rows) {
      const cost = Number(row["Builder Cost"]);
      const bps = markupBasisPointsFromProposalRow(row);
      client += Math.round(cost * (1 + bps / 10_000) * 100);
    }
    expect(client).toBe(4235 * 100 + 1210 * 100);
  });
});
