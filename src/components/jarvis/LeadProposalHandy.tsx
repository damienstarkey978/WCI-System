/**
 * Primary notes → estimate → proposal surface on a lead's Proposals tab.
 * Mirrors Handoff Handy: notes/photos first, draft a real Estimate, then
 * explicitly convert to a client-facing Proposal.
 */

"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";

import { JarvisChatPanel } from "@/components/jarvis/JarvisChatPanel";
import { JarvisSetupNotice } from "@/components/jarvis/JarvisSetupNotice";
import { JARVIS_LEAD_PROPOSAL_SUGGESTIONS } from "@/lib/jarvis/suggestions";

export type LeadHandyEstimateSummary = {
  readonly id: string;
  readonly title: string;
  readonly status: string;
  readonly aiGenerated: boolean;
  readonly totalLabel: string;
  readonly lineItemCount: number;
  readonly proposalId: string | null;
};

export function LeadProposalHandy({
  leadId,
  leadName,
  leadTitle,
  leadEmail,
  leadPhone,
  leadAddress,
  leadNotes,
  generalPhotos,
  estimates,
  jarvisUiEnabled,
  anthropicConfigured,
  manualForm,
}: {
  readonly leadId: string;
  readonly leadName: string;
  readonly leadTitle: string | null;
  readonly leadEmail: string | null;
  readonly leadPhone: string | null;
  readonly leadAddress: string | null;
  readonly leadNotes: string | null;
  /** Image attachments (or post-convert Pre-Sale Photos) already on the General tab. */
  readonly generalPhotos: readonly { id: string; fileName: string }[];
  readonly estimates: readonly LeadHandyEstimateSummary[];
  readonly jarvisUiEnabled: boolean;
  readonly anthropicConfigured: boolean;
  readonly manualForm: ReactNode;
}) {
  const ready = jarvisUiEnabled && anthropicConfigured;
  const [manualOpen, setManualOpen] = useState(false);
  const pendingEstimates = estimates.filter((estimate) => !estimate.proposalId);
  const convertedEstimates = estimates.filter((estimate) => estimate.proposalId);

  return (
    <div className="flex flex-col gap-4">
      <div
        className="overflow-hidden rounded-xl border"
        style={{
          borderColor: "color-mix(in srgb, var(--bt-primary) 28%, var(--bt-border))",
          background: "linear-gradient(180deg, color-mix(in srgb, var(--bt-primary) 8%, transparent), var(--bt-panel-bg))",
        }}
      >
        <div className="flex flex-col gap-2 px-4 pt-4 sm:flex-row sm:items-end sm:justify-between sm:px-5">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em]" style={{ color: "var(--bt-primary)" }}>
              Ask Jarvis
            </p>
            <h2 className="text-lg font-semibold text-[var(--bt-text)] sm:text-xl">Notes to estimate</h2>
            <p className="mt-1 max-w-xl text-xs text-[var(--bt-muted)] sm:text-sm">
              Same path as Handoff Handy: seed General notes/photos, draft cost-coded line items first,
              then convert the estimate into a client proposal. Nothing sends until you send it.
            </p>
          </div>
          <ol className="flex flex-wrap items-center gap-1.5 text-[10px] font-semibold sm:justify-end">
            <li className="rounded-full px-2.5 py-1 text-[var(--bt-on-primary)]" style={{ background: "var(--bt-primary)" }}>
              1 Notes
            </li>
            <li aria-hidden className="text-[var(--bt-muted)]">
              →
            </li>
            <li className="rounded-full px-2.5 py-1" style={{ background: "var(--bt-panel-bg)", color: "var(--bt-text)" }}>
              2 Estimate
            </li>
            <li aria-hidden className="text-[var(--bt-muted)]">
              →
            </li>
            <li className="rounded-full px-2.5 py-1 text-[var(--bt-muted)]" style={{ background: "var(--bt-panel-bg)" }}>
              3 Proposal
            </li>
          </ol>
        </div>

        <div className="p-3 sm:p-4">
          {ready ? (
            <JarvisChatPanel
              context={{
                page: "lead_detail",
                leadId,
                leadName,
                leadTitle,
                leadEmail,
                leadPhone,
                leadAddress,
                leadNotes,
                tab: "proposals",
              }}
              storageKey={`lead-proposal:${leadId}`}
              suggestions={[...JARVIS_LEAD_PROPOSAL_SUGGESTIONS]}
              emptyStateHint="Describe the scope, measurements, and attach photos. Jarvis drafts a DRAFT estimate (not a proposal). Review the spreadsheet, then Convert to Proposal."
              heightClassName="h-[28rem] min-h-[20rem] sm:h-[32rem]"
              generalNotes={leadNotes}
              generalPhotos={generalPhotos}
              leadIdForGeneralPhotos={leadId}
            />
          ) : (
            <JarvisSetupNotice uiEnabled={jarvisUiEnabled} anthropicConfigured={anthropicConfigured} />
          )}
        </div>
      </div>

      {pendingEstimates.length > 0 ? (
        <div className="rounded-xl border bg-[var(--bt-panel-bg)] p-3 sm:p-4" style={{ borderColor: "var(--bt-border)" }}>
          <div className="flex items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-semibold text-[var(--bt-text)]">Estimates ready to convert</h3>
              <p className="text-xs text-[var(--bt-muted)]">Open the spreadsheet, then Convert to Proposal.</p>
            </div>
            <span
              className="rounded-full px-2 py-0.5 text-[10px] font-semibold text-[var(--bt-on-primary)]"
              style={{ background: "var(--bt-primary)" }}
            >
              Step 2
            </span>
          </div>
          <ul className="mt-3 flex flex-col gap-2">
            {pendingEstimates.map((estimate) => (
              <li
                key={estimate.id}
                className="flex flex-col gap-2 rounded-lg border px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between"
                style={{ borderColor: "var(--bt-border)" }}
              >
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium text-[var(--bt-text)]">{estimate.title}</div>
                  <div className="text-xs text-[var(--bt-muted)]">
                    {estimate.totalLabel} · {estimate.lineItemCount} line{estimate.lineItemCount === 1 ? "" : "s"}
                    {estimate.aiGenerated ? " · Jarvis" : ""} · {estimate.status}
                  </div>
                </div>
                <Link
                  href={`/leads/estimates/${estimate.id}`}
                  className="min-h-10 touch-manipulation rounded px-3 py-2 text-center text-xs font-semibold text-[var(--bt-on-primary)] sm:min-h-0 sm:py-1.5"
                  style={{ background: "var(--bt-primary)" }}
                >
                  Review estimate
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {convertedEstimates.length > 0 ? (
        <div className="rounded-xl border bg-[var(--bt-panel-bg)] p-3 sm:p-4" style={{ borderColor: "var(--bt-border)" }}>
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-[var(--bt-text)]">Proposals from estimates</h3>
            <span className="text-[10px] font-semibold text-[var(--bt-muted)]">Step 3</span>
          </div>
          <ul className="mt-2 flex flex-col gap-2">
            {convertedEstimates.map((estimate) => (
              <li
                key={estimate.id}
                className="flex flex-col gap-2 rounded-lg border px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between"
                style={{ borderColor: "var(--bt-border)" }}
              >
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium text-[var(--bt-text)]">{estimate.title}</div>
                  <div className="text-xs text-[var(--bt-muted)]">{estimate.totalLabel}</div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Link
                    href={`/leads/estimates/${estimate.id}`}
                    className="min-h-10 touch-manipulation rounded border px-3 py-2 text-center text-xs font-medium text-[var(--bt-text)] sm:min-h-0 sm:py-1.5"
                    style={{ borderColor: "var(--bt-border)" }}
                  >
                    Estimate
                  </Link>
                  {estimate.proposalId ? (
                    <Link
                      href={`/leads/proposals/${estimate.proposalId}?view=proposal`}
                      className="min-h-10 touch-manipulation rounded px-3 py-2 text-center text-xs font-semibold text-[var(--bt-on-primary)] sm:min-h-0 sm:py-1.5"
                      style={{ background: "var(--bt-primary)" }}
                    >
                      Proposal
                    </Link>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="rounded-xl border bg-[var(--bt-panel-bg)]" style={{ borderColor: "var(--bt-border)" }}>
        <button
          type="button"
          onClick={() => setManualOpen((open) => !open)}
          className="flex min-h-11 w-full touch-manipulation items-center justify-between gap-2 px-4 py-3 text-left text-sm font-medium text-[var(--bt-text)] sm:min-h-0"
          aria-expanded={manualOpen}
        >
          <span>Manual proposal (optional)</span>
          <span className="text-xs font-normal text-[var(--bt-muted)]">{manualOpen ? "Hide" : "Show"}</span>
        </button>
        {manualOpen ? (
          <div className="border-t p-3 sm:p-4" style={{ borderColor: "var(--bt-border)" }}>
            {manualForm}
          </div>
        ) : (
          <p className="border-t px-4 py-2.5 text-xs text-[var(--bt-muted)]" style={{ borderColor: "var(--bt-border)" }}>
            Prefer line-by-line entry without Jarvis? Expand to use the classic form. Jarvis above is the
            primary path for notes → estimate → proposal.
          </p>
        )}
      </div>
    </div>
  );
}
