import Link from "next/link";

import { JarvisCharacter } from "@/components/jarvis/JarvisCharacter";
import { formatMoney } from "@/lib/format";
import type { DailyBrief } from "@/lib/reports/daily-brief";

/**
 * BUILD_SPEC.md's dashboard "jarvis-card" — real character art overlapping a speech
 * bubble, always visible (not gated behind the separate fun-UI toggle). The bubble
 * copy is driven by the same daily-brief data the "Daily brief" section below it
 * renders, so it can never say something the numbers on this same page contradict —
 * it just leads with whatever's most worth a nudge, falling back to a plain "ready
 * when you are" once nothing needs attention.
 */
export function JarvisHeroCard({ dailyBrief }: { dailyBrief: DailyBrief }) {
  let message: string;
  if (dailyBrief.overdueInvoices.length > 0) {
    message = `${dailyBrief.overdueInvoices.length} invoice${dailyBrief.overdueInvoices.length === 1 ? "" : "s"} totaling ${formatMoney(dailyBrief.overdueInvoiceTotalCents)} need a nudge. Want me to draft them?`;
  } else if (dailyBrief.jobsOverBudget.length > 0) {
    message = `${dailyBrief.jobsOverBudget.length} job${dailyBrief.jobsOverBudget.length === 1 ? " is" : "s are"} over budget. Want me to break down why?`;
  } else if (dailyBrief.pendingChangeOrderCount > 0) {
    message = `${dailyBrief.pendingChangeOrderCount} change order${dailyBrief.pendingChangeOrderCount === 1 ? "" : "s"} pending approval.`;
  } else if (dailyBrief.proposalsNeedingFollowUp.length > 0) {
    message = `${dailyBrief.proposalsNeedingFollowUp.length} proposal${dailyBrief.proposalsNeedingFollowUp.length === 1 ? "" : "s"} could use a follow-up.`;
  } else {
    message = "Nothing urgent right now. Ask me anything about the business.";
  }

  return (
    <Link href="/jarvis" className="mb-2 flex items-end">
      <JarvisCharacter pose="crossed" width={118} height={150} className="z-10 -mb-1.5" />
      <div
        className="-ml-4 flex-1 rounded-2xl border p-4"
        style={{ background: "var(--bt-panel-bg)", borderColor: "var(--bt-border)" }}
      >
        <div className="mb-1 text-[10.5px] font-bold tracking-wide uppercase" style={{ color: "var(--bt-primary)" }}>
          Jarvis
        </div>
        <p className="text-sm text-[var(--bt-text)]">{message}</p>
        <div className="mt-1.5 text-[10px] text-[var(--bt-muted)]">Let&apos;s get to work.</div>
      </div>
    </Link>
  );
}
