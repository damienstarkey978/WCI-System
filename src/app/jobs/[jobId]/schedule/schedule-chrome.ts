export type ScheduleViewKey = "calendar" | "list" | "gantt";
export type GanttScale = "day" | "week" | "month";
export type CalendarMode = "month" | "week" | "day" | "agenda";

/** Dispatch helpers used by the schedule toolbar icon buttons → ScheduleGantt listeners. */
export function dispatchScheduleChrome(action: "expand-columns" | "fullscreen" | "export") {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(`wci-schedule-${action}`));
}
