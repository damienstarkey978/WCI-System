import type { CalendarMode, GanttScale, ScheduleViewKey } from "@/app/jobs/[jobId]/schedule/schedule-chrome";

import { ParityScheduleClient } from "./parity-schedule-client";

/**
 * Visual fixture for Schedule BT parity (Gantt / List / Calendar chrome).
 * No DB. Deep-link views: /dev/parity-schedule?view=gantt|list|calendar
 */
export default async function ParitySchedulePage({ searchParams }: PageProps<"/dev/parity-schedule">) {
  const sp = await searchParams;
  const viewParam = typeof sp.view === "string" ? sp.view : "gantt";
  const view: ScheduleViewKey = viewParam === "list" || viewParam === "calendar" || viewParam === "gantt" ? viewParam : "gantt";
  const criticalPath = sp.critical === "1";
  const phasesOn = sp.phases === "1";
  const scaleParam = typeof sp.scale === "string" ? sp.scale : "day";
  const ganttScale: GanttScale = scaleParam === "week" || scaleParam === "month" ? scaleParam : "day";
  const calParam = typeof sp.cal === "string" ? sp.cal : "month";
  const calendarMode: CalendarMode =
    calParam === "week" || calParam === "day" || calParam === "agenda" ? calParam : "month";

  return (
    <ParityScheduleClient
      view={view}
      criticalPath={criticalPath}
      phasesOn={phasesOn}
      ganttScale={ganttScale}
      calendarMode={calendarMode}
    />
  );
}
