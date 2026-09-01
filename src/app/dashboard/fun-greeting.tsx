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
    <div
      className="flex items-center gap-3 rounded-2xl border-2 p-3"
      style={{ borderColor: "var(--bt-primary)", background: "linear-gradient(135deg, color-mix(in srgb, var(--bt-primary) 8%, transparent), transparent)" }}
    >
      <JarvisMascot expression="happy" size={64} bob badge />
      <p className="text-sm text-[var(--bt-text)]">
        <span className="wci-fun-heading font-semibold">Hey, it&apos;s Jarvis!</span>{" "}
        <span className="text-[var(--bt-muted)]">I&apos;m keeping an eye on the business below — ask me anything, or tap me in the corner any time.</span>
      </p>
    </div>
  );
}
