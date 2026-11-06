"use client";

import Link from "next/link";

/**
 * Buildertrend Lead Activities surface tabs (List / Activity / Calendar / …).
 * Activity templates omitted until a real page exists (no inert tab).
 */
export const LEAD_ACTIVITIES_TABS = [
  { key: "list", label: "List view", href: "/leads/activities?view=list" },
  { key: "activity", label: "Activity view", href: "/leads/activities" },
  { key: "calendar", label: "Activity calendar", href: "/leads/calendar" },
  { key: "proposals", label: "Lead proposals", href: "/leads/proposals" },
  { key: "proposal-templates", label: "Proposal templates", href: "/leads/proposal-templates" },
  { key: "map", label: "Map", href: "/leads/map" },
] as const;

export type LeadActivitiesTabKey = (typeof LEAD_ACTIVITIES_TABS)[number]["key"];

export function LeadActivitiesSubnav({ active }: { active: LeadActivitiesTabKey }) {
  return (
    <nav
      className="flex gap-1 overflow-x-auto border-b"
      style={{ borderColor: "var(--bt-border)" }}
      aria-label="Lead Activities views"
    >
      {LEAD_ACTIVITIES_TABS.map((tab) => {
        const isActive = tab.key === active;
        const className =
          "-mb-px inline-flex shrink-0 items-center border-b-2 px-3 py-2.5 text-sm font-medium transition";
        const style = {
          borderColor: isActive ? "var(--bt-primary)" : "transparent",
          color: isActive ? "var(--bt-primary)" : "var(--bt-muted)",
        };
        return (
          <Link key={tab.key} href={tab.href} className={className} style={style} aria-current={isActive ? "page" : undefined}>
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
