"use client";

import { updateLeadStageAction } from "./actions";

const STAGES = ["NEW", "CONTACTED", "QUALIFIED", "PROPOSAL_SENT", "WON", "LOST"] as const;

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
        {STAGES.map((value) => (
          <option key={value} value={value}>
            {value.replace(/_/g, " ")}
          </option>
        ))}
      </select>
    </form>
  );
}
