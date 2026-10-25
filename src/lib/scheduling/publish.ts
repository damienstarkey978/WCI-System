/**
 * Whether a schedule is visible to anyone outside the office (client portal, vendor
 * portal, weekly client digests). "Schedule Online" must be on and "Draft mode" off.
 * Pure so every outside surface applies the exact same rule.
 */
export function isSchedulePublished(schedule: { readonly isOnline: boolean; readonly isDraft: boolean }): boolean {
  return schedule.isOnline && !schedule.isDraft;
}
