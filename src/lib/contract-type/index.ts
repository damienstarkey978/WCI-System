/**
 * Contract Type strategy objects.
 *
 * Fixed Price vs Open Book is a **system-wide behavioral branch**, not a display label
 * (CLAUDE.md 2.3). Markup calculation, invoice generation, client cost visibility and
 * report columns all differ. All of that behavior lives here, behind one interface, so
 * that no `if (job.contractType === ...)` ever needs to be written anywhere else.
 *
 * Adding a contract type means adding one policy object in this directory — every
 * consumer picks it up automatically.
 */

import { ContractType } from "@/generated/prisma/enums";
import { applyMargin, applyMarkup, marginBasisPoints, profitCents, type BasisPoints, type Cents } from "@/lib/money";

/** How a line's client price is derived: from what was budgeted, or from what was spent. */
export type ClientPriceBasis = "BUDGETED_COST" | "ACTUAL_COST";

/** What an invoice bills against. */
export type InvoiceBasis = "CONTRACT_AMOUNT" | "ACTUAL_COST_PLUS_MARKUP";

/** Whether a rate is applied as a markup on cost or a margin on price. */
export type RateMode = "MARKUP" | "MARGIN";

/**
 * Budget view columns (CLAUDE.md 3, "four views: Standard/Job Costing/Client
 * Pricing/Profit"). Which of these render depends on the contract type.
 */
export type BudgetColumnId =
  | "originalBudgetCost"
  | "revisedBudgetCost"
  | "pendingCost"
  | "committedCost"
  | "actualCost"
  | "projectedCost"
  | "costToComplete"
  | "originalClientPrice"
  | "revisedClientPrice"
  | "amountInvoiced"
  | "remainingToInvoice"
  | "projectedProfit"
  | "projectedMarginPct";

export interface ClientPriceInput {
  /** Budgeted (original or revised) cost for the line. */
  readonly budgetedCostCents: Cents;
  /** Actual cost booked against the line so far. */
  readonly actualCostCents: Cents;
  /** The rate to apply, in basis points. */
  readonly rateBasisPoints: BasisPoints;
  /** Whether `rateBasisPoints` is a markup on cost or a margin on price. */
  readonly rateMode: RateMode;
}

export interface ContractTypePolicy {
  readonly contractType: ContractType;
  readonly label: string;
  /** Which cost figure drives the price the client owes. */
  readonly clientPriceBasis: ClientPriceBasis;
  /** What invoices bill against. */
  readonly invoiceBasis: InvoiceBasis;
  /** Whether the client may ever be shown underlying cost figures in their portal. */
  readonly exposesCostsToClient: boolean;
  /**
   * Whether a cost overrun automatically increases what the client owes.
   * False on fixed price: overruns eat the builder's margin until a Change Order is
   * approved. True on open book: the client pays actual cost plus the agreed rate.
   */
  readonly costOverrunsFlowToClient: boolean;

  /** The price the client owes for a line, in cents. */
  clientPriceCents(input: ClientPriceInput): Cents;
  /** Columns the budget grid should render for this contract type. */
  budgetColumns(): readonly BudgetColumnId[];
}

/** Cost columns are identical across contract types; only pricing/profit columns differ. */
const COST_COLUMNS: readonly BudgetColumnId[] = [
  "originalBudgetCost",
  "revisedBudgetCost",
  "pendingCost",
  "committedCost",
  "actualCost",
  "projectedCost",
  "costToComplete",
];

function priceFromCost(costCents: Cents, rateBasisPoints: BasisPoints, rateMode: RateMode): Cents {
  return rateMode === "MARGIN"
    ? applyMargin(costCents, rateBasisPoints)
    : applyMarkup(costCents, rateBasisPoints);
}

/**
 * Fixed Price: the client owes the contract amount, derived from the **budgeted** cost.
 * Spending more than budgeted does not increase the client's price — it reduces profit
 * until a Change Order revises the contract. Costs are never exposed in the portal.
 */
const FIXED_PRICE_POLICY: ContractTypePolicy = {
  contractType: ContractType.FIXED_PRICE,
  label: "Fixed Price",
  clientPriceBasis: "BUDGETED_COST",
  invoiceBasis: "CONTRACT_AMOUNT",
  exposesCostsToClient: false,
  costOverrunsFlowToClient: false,

  clientPriceCents({ budgetedCostCents, rateBasisPoints, rateMode }) {
    return priceFromCost(budgetedCostCents, rateBasisPoints, rateMode);
  },

  budgetColumns() {
    return [
      ...COST_COLUMNS,
      "originalClientPrice",
      "revisedClientPrice",
      "amountInvoiced",
      "remainingToInvoice",
      "projectedProfit",
      "projectedMarginPct",
    ];
  },
};

/**
 * Open Book: the client owes actual cost plus the agreed rate, so overruns flow
 * straight through to them and costs are visible in their portal by design.
 * "Original client price" is not a meaningful column here — there is no fixed contract
 * amount to compare against — so it is omitted from the budget grid.
 */
const OPEN_BOOK_POLICY: ContractTypePolicy = {
  contractType: ContractType.OPEN_BOOK,
  label: "Open Book",
  clientPriceBasis: "ACTUAL_COST",
  invoiceBasis: "ACTUAL_COST_PLUS_MARKUP",
  exposesCostsToClient: true,
  costOverrunsFlowToClient: true,

  clientPriceCents({ actualCostCents, rateBasisPoints, rateMode }) {
    return priceFromCost(actualCostCents, rateBasisPoints, rateMode);
  },

  budgetColumns() {
    return [
      ...COST_COLUMNS,
      "revisedClientPrice",
      "amountInvoiced",
      "remainingToInvoice",
      "projectedProfit",
      "projectedMarginPct",
    ];
  },
};

const POLICIES: Readonly<Record<ContractType, ContractTypePolicy>> = {
  [ContractType.FIXED_PRICE]: FIXED_PRICE_POLICY,
  [ContractType.OPEN_BOOK]: OPEN_BOOK_POLICY,
};

/** The single entry point. Every module consults this instead of branching on the enum. */
export function contractTypePolicy(contractType: ContractType): ContractTypePolicy {
  return POLICIES[contractType];
}

export function allContractTypePolicies(): readonly ContractTypePolicy[] {
  return Object.values(POLICIES);
}

export interface LineProfit {
  readonly clientPriceCents: Cents;
  readonly profitCents: Cents;
  readonly marginBasisPoints: BasisPoints;
}

/**
 * Profit for a line under a given contract type. Profit is always measured against
 * *actual* cost regardless of contract type — the difference is what the client pays,
 * which the policy decides.
 */
export function lineProfit(contractType: ContractType, input: ClientPriceInput): LineProfit {
  const policy = contractTypePolicy(contractType);
  const price = policy.clientPriceCents(input);
  return {
    clientPriceCents: price,
    profitCents: profitCents(price, input.actualCostCents),
    marginBasisPoints: marginBasisPoints(price, input.actualCostCents),
  };
}
