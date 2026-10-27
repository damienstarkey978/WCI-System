/**
 * Primary notes → estimate → proposal surface on a lead's Proposals tab.
 * Mirrors Handoff's estimate-first flow: draft notes/photos with Jarvis, review a
 * real Estimate, then explicitly convert to a client-facing Proposal.
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

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold text-[var(--bt-text)]">Draft with Jarvis</h2>
        <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-[var(--bt-muted)]">
          <span className="rounded px-2 py-1 font-semibold text-[var(--bt-on-primary)]" style={{ background: "var(--bt-primary)" }}>
            1. Notes
          </span>
          <span aria-hidden>→</span>
          <span className="rounded px-2 py-1" style={{ background: "var(--bt-panel-bg-muted)" }}>
            2. Estimate
          </span>
          <span aria-hidden>→</span>
          <span className="rounded px-2 py-1" style={{ background: "var(--bt-panel-bg-muted)" }}>
            3. Proposal
          </span>
        </div>
        <p className="text-xs text-[var(--bt-muted)] sm:text-sm">
          Handoff-style path: pull General notes/photos, draft a cost-coded estimate first, then convert
          that estimate into a client-facing DRAFT proposal. Nothing is sent until you send it.
        </p>
      </div>

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
          emptyStateHint="Give Jarvis the scope of work, measurements, and any photos — it drafts a DRAFT estimate with line items and cost codes first. Review the estimate, then Create Proposal for the client narrative."
          heightClassName="h-[28rem] min-h-[20rem] sm:h-[32rem]"
          generalNotes={leadNotes}
          generalPhotos={generalPhotos}
          leadIdForGeneralPhotos={leadId}
        />
      ) : (
        <JarvisSetupNotice uiEnabled={jarvisUiEnabled} anthropicConfigured={anthropicConfigured} />
      )}

      {pendingEstimates.length > 0 ? (
        <div className="rounded-lg border bg-[var(--bt-panel-bg)] p-3 sm:p-4" style={{ borderColor: "var(--bt-border)" }}>
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-[var(--bt-text)]">Estimates ready to convert</h3>
            <span className="text-xs text-[var(--bt-muted)]">Step 2</span>
          </div>
          <ul className="mt-2 flex flex-col gap-2">
            {pendingEstimates.map((estimate) => (
              <li
                key={estimate.id}
                className="flex flex-col gap-2 rounded border px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between"
                style={{ borderColor: "var(--bt-border)" }}
              >
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium text-[var(--bt-text)]">{estimate.title}</div>
                  <div className="text-xs text-[var(--bt-muted)]">
                    {estimate.totalLabel} · {estimate.lineItemCount} line{estimate.lineItemCount === 1 ? "" : "s"}
                    {estimate.aiGenerated ? " · Jarvis" : ""}
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

      <div className="rounded-lg border bg-[var(--bt-panel-bg)]" style={{ borderColor: "var(--bt-border)" }}>
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
