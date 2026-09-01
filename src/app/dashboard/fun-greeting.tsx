"use client";

/** Purely additive: renders nothing unless the fun-UI toggle (src/components/
 *  settings/FunUiToggle.tsx) is on, so leaving it off reproduces the dashboard
 *  exactly as it was before this existed. */

import { JarvisMascot } from "@/components/jarvis/JarvisMascot";
import { useFunUi } from "@/components/jarvis/useFunUi";

export function DashboardFunGreeting() {
  const funUi = useFunUi();
  if (!funUi) return null;

  return (
    <div className="flex items-center gap-3 rounded-lg border bg-[var(--bt-panel-bg)] p-3" style={{ borderColor: "var(--bt-border)" }}>
      <JarvisMascot expression="happy" size={40} />
      <p className="text-sm text-[var(--bt-muted)]">
        Hey — I&apos;m keeping an eye on the business below. Ask me anything in the chat, or tap me in the corner any time.
      </p>
    </div>
  );
}
