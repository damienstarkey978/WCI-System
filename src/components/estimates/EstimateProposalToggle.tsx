/**
 * Handoff-style Estimate | Proposal segmented control.
 * Soft pill chrome (selected = light fill + primary text), WCI colors.
 */

import Link from "next/link";

export function EstimateProposalToggle({
  active,
  estimateHref,
  proposalHref,
  proposalDisabledReason,
}: {
  readonly active: "estimate" | "proposal";
  readonly estimateHref: string;
  readonly proposalHref: string | null;
  /** When proposal is not available yet (e.g. not converted). */
  readonly proposalDisabledReason?: string;
}) {
  const base =
    "min-h-9 flex-1 touch-manipulation rounded-md px-2.5 py-1.5 text-center text-[11px] font-semibold transition-colors sm:min-h-0 sm:flex-none sm:px-3 sm:py-1";

  function styleFor(isActive: boolean) {
    if (isActive) {
      return {
        background: "var(--bt-panel-bg)",
        color: "var(--bt-primary)",
        boxShadow: "0 1px 2px color-mix(in srgb, var(--bt-text) 10%, transparent)",
      } as const;
    }
    return {
      background: "transparent",
      color: "var(--bt-muted)",
    } as const;
  }

  return (
    <div
      className="inline-flex w-full gap-0.5 rounded-lg border p-0.5 sm:w-auto"
      style={{ borderColor: "var(--bt-border)", background: "var(--bt-panel-bg-muted)" }}
      role="tablist"
      aria-label="Estimate or Proposal view"
    >
      <Link
        href={estimateHref}
        role="tab"
        aria-selected={active === "estimate"}
        className={base}
        style={styleFor(active === "estimate")}
      >
        Estimate
      </Link>
      {proposalHref ? (
        <Link
          href={proposalHref}
          role="tab"
          aria-selected={active === "proposal"}
          className={base}
          style={styleFor(active === "proposal")}
        >
          Proposal
        </Link>
      ) : (
        <span
          role="tab"
          aria-selected={false}
          aria-disabled="true"
          title={proposalDisabledReason ?? "Convert the estimate first"}
          className={`${base} cursor-not-allowed opacity-45`}
          style={styleFor(false)}
        >
          Proposal
        </span>
      )}
    </div>
  );
}
