"use client";

import { toggleLeadActivityCompletedAction } from "./actions";

export function ToggleActivityButton({ leadId, activityId, completed }: { leadId: string; activityId: string; completed: boolean }) {
  return (
    <form action={toggleLeadActivityCompletedAction}>
      <input type="hidden" name="leadId" value={leadId} />
      <input type="hidden" name="activityId" value={activityId} />
      <input type="hidden" name="completed" value={(!completed).toString()} />
      <button type="submit" className="text-xs font-medium text-[var(--bt-primary)] hover:underline">
        {completed ? "Reopen" : "Mark done"}
      </button>
    </form>
  );
}
