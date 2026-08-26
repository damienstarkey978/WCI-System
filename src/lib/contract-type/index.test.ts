import { describe, expect, it } from "vitest";

import { ContractType } from "@/generated/prisma/enums";
import { allContractTypePolicies, contractTypePolicy, lineProfit } from "@/lib/contract-type";

const FIXED = contractTypePolicy(ContractType.FIXED_PRICE);
const OPEN_BOOK = contractTypePolicy(ContractType.OPEN_BOOK);

describe("fixed price", () => {
  it("prices from the budgeted cost, not what was actually spent", () => {
    const price = FIXED.clientPriceCents({
      budgetedCostCents: 100_000,
      actualCostCents: 130_000, // overran by $300
      rateBasisPoints: 2_000,
      rateMode: "MARKUP",
    });
    expect(price).toBe(120_000);
  });

  it("absorbs an overrun as lost profit rather than billing the client", () => {
    const result = lineProfit(ContractType.FIXED_PRICE, {
      budgetedCostCents: 100_000,
      actualCostCents: 130_000,
      rateBasisPoints: 2_000,
      rateMode: "MARKUP",
    });
    expect(result.clientPriceCents).toBe(120_000);
    expect(result.profitCents).toBe(-10_000); // $1,200 billed against $1,300 spent
  });

  it("never exposes costs to the client", () => {
    expect(FIXED.exposesCostsToClient).toBe(false);
    expect(FIXED.costOverrunsFlowToClient).toBe(false);
  });

  it("bills against the contract amount", () => {
    expect(FIXED.invoiceBasis).toBe("CONTRACT_AMOUNT");
  });

  it("shows the original contract price column", () => {
    expect(FIXED.budgetColumns()).toContain("originalClientPrice");
  });
});

describe("open book", () => {
  it("prices from the actual cost, so overruns flow through to the client", () => {
    const price = OPEN_BOOK.clientPriceCents({
      budgetedCostCents: 100_000,
      actualCostCents: 130_000,
      rateBasisPoints: 2_000,
      rateMode: "MARKUP",
    });
    expect(price).toBe(156_000);
  });

  it("preserves the agreed margin through an overrun", () => {
    const result = lineProfit(ContractType.OPEN_BOOK, {
      budgetedCostCents: 100_000,
      actualCostCents: 130_000,
      rateBasisPoints: 2_000,
      rateMode: "MARKUP",
    });
    expect(result.clientPriceCents).toBe(156_000);
    expect(result.profitCents).toBe(26_000);
  });

  it("exposes costs to the client by design", () => {
    expect(OPEN_BOOK.exposesCostsToClient).toBe(true);
    expect(OPEN_BOOK.costOverrunsFlowToClient).toBe(true);
  });

  it("bills actual cost plus markup", () => {
    expect(OPEN_BOOK.invoiceBasis).toBe("ACTUAL_COST_PLUS_MARKUP");
  });

  it("omits the original contract price column, which has no meaning here", () => {
    expect(OPEN_BOOK.budgetColumns()).not.toContain("originalClientPrice");
  });
});

describe("the two contract types genuinely diverge", () => {
  it("produces different client prices from identical inputs once actuals differ from budget", () => {
    const input = {
      budgetedCostCents: 250_000,
      actualCostCents: 275_000,
      rateBasisPoints: 1_500,
      rateMode: "MARKUP" as const,
    };
    expect(FIXED.clientPriceCents(input)).not.toBe(OPEN_BOOK.clientPriceCents(input));
  });

  it("agrees when the job lands exactly on budget", () => {
    const input = {
      budgetedCostCents: 250_000,
      actualCostCents: 250_000,
      rateBasisPoints: 1_500,
      rateMode: "MARKUP" as const,
    };
    expect(FIXED.clientPriceCents(input)).toBe(OPEN_BOOK.clientPriceCents(input));
  });
});

describe("rate mode", () => {
  it("applies margin differently from markup under both contract types", () => {
    for (const policy of allContractTypePolicies()) {
      const base = { budgetedCostCents: 100_000, actualCostCents: 100_000, rateBasisPoints: 2_000 };
      expect(policy.clientPriceCents({ ...base, rateMode: "MARKUP" })).toBe(120_000);
      expect(policy.clientPriceCents({ ...base, rateMode: "MARGIN" })).toBe(125_000);
    }
  });
});

describe("policy registry", () => {
  it("covers every contract type in the schema", () => {
    expect(allContractTypePolicies()).toHaveLength(Object.keys(ContractType).length);
  });

  it("returns a policy whose contractType matches the lookup key", () => {
    for (const contractType of Object.values(ContractType)) {
      expect(contractTypePolicy(contractType).contractType).toBe(contractType);
    }
  });

  it("gives every policy the shared cost columns", () => {
    for (const policy of allContractTypePolicies()) {
      expect(policy.budgetColumns()).toEqual(
        expect.arrayContaining(["originalBudgetCost", "actualCost", "projectedCost", "costToComplete"]),
      );
    }
  });
});
