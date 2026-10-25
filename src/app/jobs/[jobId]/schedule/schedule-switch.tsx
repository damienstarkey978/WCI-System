import { setScheduleFlagAction } from "./actions";

/** A labelled on/off switch that flips a Schedule flag (isOnline / isDraft) through a server action. */
export function ScheduleSwitch({
  jobId,
  scheduleId,
  field,
  on,
  label,
  title,
}: {
  jobId: string;
  scheduleId: string;
  field: "isOnline" | "isDraft";
  on: boolean;
  label: string;
  title: string;
}) {
  return (
    <form action={setScheduleFlagAction} title={title}>
      <input type="hidden" name="jobId" value={jobId} />
      <input type="hidden" name="scheduleId" value={scheduleId} />
      <input type="hidden" name="field" value={field} />
      <input type="hidden" name="value" value={String(!on)} />
      <button type="submit" role="switch" aria-checked={on} className="inline-flex items-center gap-2 text-sm font-medium text-[var(--bt-text)]">
        <span className="relative inline-block h-5 w-9 rounded-full" style={{ background: on ? "var(--bt-primary)" : "#d1d5db" }}>
          <span className="absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all" style={{ left: on ? "18px" : "2px" }} />
        </span>
        {label}
      </button>
    </form>
  );
}
