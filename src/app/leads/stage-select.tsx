"use client";

import { updateLeadStageAction } from "./actions";

const STAGES = [
  { value: "NEW", label: "New" },
  { value: "CONTACTED", label: "Contacted" },
  { value: "QUALIFIED", label: "Qualified" },
  { value: "PROPOSAL_SENT", label: "Quote Sent" },
  { value: "WON", label: "Won" },
  { value: "LOST", label: "Lost" },
] as const;

export function StageSelect({ leadId, stage }: { leadId: string; stage: string }) {
  return (
    <form action={updateLeadStageAction}>
      <input type="hidden" name="leadId" value={leadId} />
      <select
        name="stage"
        defaultValue={stage}
        onChange={(event) => event.currentTarget.form?.requestSubmit()}
        className="rounded border px-2 py-1 text-xs outline-none"
        style={{ borderColor: "var(--bt-border)" }}
      >
        {STAGES.map((entry) => (
          <option key={entry.value} value={entry.value}>
            {entry.label}
          </option>
        ))}
      </select>
    </form>
  );
}
