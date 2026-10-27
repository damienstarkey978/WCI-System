/**
 * Short Proposals-tab entry into notes → estimate → proposal.
 * The Handoff-like product experience is the three-panel estimate workspace
 * (`/leads/estimates/{id}`), not this card. Empty leads keep a compact composer;
 * existing drafts should open the workspace (see lead page redirect).
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
  composeMode = false,
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
  /** When true, show the short notes entry even if estimates already exist. */
  readonly composeMode?: boolean;
}) {
  const ready = jarvisUiEnabled && anthropicConfigured;
  const [manualOpen, setManualOpen] = useState(false);
  const pendingEstimates = estimates.filter((estimate) => !estimate.proposalId);
  const convertedEstimates = estimates.filter((estimate) => estimate.proposalId);
  const showComposer = composeMode || estimates.length === 0;

  return (
    <div className="flex flex-col gap-4">
      {pendingEstimates.length > 0 ? (
        <div className="rounded-xl border bg-[var(--bt-panel-bg)] p-3 sm:p-4" style={{ borderColor: "var(--bt-border)" }}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-semibold text-[var(--bt-text)]">Open estimate workspace</h3>
              <p className="text-xs text-[var(--bt-muted)]">
                Spreadsheet + docked Jarvis — not this Proposals tab. Review lines, then Convert to Proposal.
              </p>
            </div>
            <span
              className="rounded-full px-2 py-0.5 text-[10px] font-semibold text-[var(--bt-on-primary)]"
              style={{ background: "var(--bt-primary)" }}
            >
              Handoff path
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
                  className="min-h-11 touch-manipulation rounded px-4 py-2.5 text-center text-sm font-semibold text-[var(--bt-on-primary)] sm:min-h-0 sm:py-2"
                  style={{ background: "var(--bt-primary)" }}
                >
                  Open workspace
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
                    Estimate workspace
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

      {showComposer ? (
        <div
          className="overflow-hidden rounded-xl border"
          style={{
            borderColor: "color-mix(in srgb, var(--bt-primary) 28%, var(--bt-border))",
            background: "var(--bt-panel-bg)",
          }}
        >
          <div className="flex flex-col gap-1 border-b px-4 py-3 sm:flex-row sm:items-center sm:justify-between" style={{ borderColor: "var(--bt-border)" }}>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em]" style={{ color: "var(--bt-primary)" }}>
                Start here
              </p>
              <h2 className="text-base font-semibold text-[var(--bt-text)]">Notes → draft estimate</h2>
              <p className="mt-0.5 max-w-xl text-xs text-[var(--bt-muted)]">
                Short entry only. After Jarvis drafts (or you open an existing draft), you land in the three-panel
                estimate workspace — spreadsheet center, Jarvis on the right — not on this card.
              </p>
            </div>
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
                emptyStateHint="Seed General notes/photos, then ask Jarvis to draft. You'll open the estimate spreadsheet workspace next."
                heightClassName="h-[22rem] min-h-[16rem] sm:h-[26rem]"
                generalNotes={leadNotes}
                generalPhotos={generalPhotos}
                leadIdForGeneralPhotos={leadId}
                navigateOnEstimateDraft
              />
            ) : (
              <JarvisSetupNotice uiEnabled={jarvisUiEnabled} anthropicConfigured={anthropicConfigured} />
            )}
          </div>
        </div>
      ) : (
        <div className="rounded-xl border px-4 py-3" style={{ borderColor: "var(--bt-border)", background: "var(--bt-panel-bg)" }}>
          <p className="text-sm text-[var(--bt-text)]">
            Need another draft from notes?{" "}
            <Link
              href={`/leads/${leadId}?tab=proposals&compose=1`}
              className="font-semibold text-[var(--bt-primary)] hover:underline"
            >
              Open short notes entry
            </Link>
          </p>
        </div>
      )}

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
            Prefer line-by-line entry without Jarvis? Expand for the classic form.
          </p>
        )}
      </div>
    </div>
  );
}
