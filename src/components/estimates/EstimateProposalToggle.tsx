/**
 * Handoff-style Estimate | Proposal segmented control.
 * Same document, two views — estimate spreadsheet vs client proposal.
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
    "min-h-10 flex-1 touch-manipulation px-3 py-2 text-center text-xs font-semibold sm:min-h-0 sm:flex-none sm:px-4 sm:py-1.5";
  const activeStyle = {
    background: "var(--bt-primary)",
    color: "var(--bt-on-primary)",
  } as const;
  const idleStyle = {
    background: "transparent",
    color: "var(--bt-text)",
  } as const;

  return (
    <div
      className="inline-flex w-full overflow-hidden rounded-lg border sm:w-auto"
      style={{ borderColor: "var(--bt-border)", background: "var(--bt-panel-bg-muted)" }}
      role="tablist"
      aria-label="Estimate or Proposal view"
    >
      <Link
        href={estimateHref}
        role="tab"
        aria-selected={active === "estimate"}
        className={base}
        style={active === "estimate" ? activeStyle : idleStyle}
      >
        Estimate
      </Link>
      {proposalHref ? (
        <Link
          href={proposalHref}
          role="tab"
          aria-selected={active === "proposal"}
          className={base}
          style={active === "proposal" ? activeStyle : idleStyle}
        >
          Proposal
        </Link>
      ) : (
        <span
          role="tab"
          aria-selected={false}
          aria-disabled="true"
          title={proposalDisabledReason ?? "Convert the estimate first"}
          className={`${base} cursor-not-allowed opacity-50`}
          style={idleStyle}
        >
          Proposal
        </span>
      )}
    </div>
  );
}
