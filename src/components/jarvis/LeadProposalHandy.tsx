/**
 * Primary notes → estimate → proposal surface on a lead's Proposals tab.
 * Always renders (never silently omit): live Jarvis chat when configured, or a
 * clear setup notice when the UI flag / Anthropic key is missing. Manual create
 * is passed as children and stays collapsed so it does not dominate an empty tab.
 */

"use client";

import { useState, type ReactNode } from "react";

import { JarvisChatPanel } from "@/components/jarvis/JarvisChatPanel";
import { JarvisSetupNotice } from "@/components/jarvis/JarvisSetupNotice";
import { JARVIS_LEAD_PROPOSAL_SUGGESTIONS } from "@/lib/jarvis/suggestions";

export function LeadProposalHandy({
  leadId,
  leadName,
  leadTitle,
  leadEmail,
  leadPhone,
  leadAddress,
  leadNotes,
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
  readonly jarvisUiEnabled: boolean;
  readonly anthropicConfigured: boolean;
  readonly manualForm: ReactNode;
}) {
  const ready = jarvisUiEnabled && anthropicConfigured;
  const [manualOpen, setManualOpen] = useState(false);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <h2 className="text-sm font-semibold text-[var(--bt-text)]">Draft with Jarvis</h2>
        <p className="text-xs text-[var(--bt-muted)] sm:text-sm">
          Handy-style path: paste scope notes (and photos), get a DRAFT cost-coded estimate and
          client-facing proposal on this lead. Review here before anything is sent.
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
          emptyStateHint="Give Jarvis the scope of work, measurements, and any photos — it drafts a full line-item estimate and the client-facing proposal that goes with it (Handy-style), always as a DRAFT for you to review before anything is sent."
          heightClassName="h-[28rem] min-h-[20rem] sm:h-[32rem]"
        />
      ) : (
        <JarvisSetupNotice uiEnabled={jarvisUiEnabled} anthropicConfigured={anthropicConfigured} />
      )}

      <div className="rounded-lg border bg-[var(--bt-panel-bg)]" style={{ borderColor: "var(--bt-border)" }}>
        <button
          type="button"
          onClick={() => setManualOpen((open) => !open)}
          className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left text-sm font-medium text-[var(--bt-text)]"
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
