"use client";

/**
 * Continuous “still working” chrome for Ask Jarvis — used while a turn is in
 * flight (composer submit → server action) and while an async estimate draft
 * is queued. Static “Jarvis is thinking…” looked idle next to an older
 * assistant bubble; this keeps motion + cycling copy visible until success
 * or error.
 */

import { useEffect, useState } from "react";

import { JarvisMascot } from "@/components/jarvis/JarvisMascot";

const GENERAL_LINES = [
  "Jarvis is thinking…",
  "Working on it…",
  "Still on it…",
  "Almost there…",
] as const;

const ESTIMATE_LINES = [
  "Working on estimate…",
  "Matching cost codes…",
  "Building line items…",
  "Checking the catalog…",
  "Almost there…",
] as const;

const PREPARE_LINES = ["Preparing photos…", "Compressing attachments…"] as const;

const DRAFT_POLL_LINES = [
  "Still drafting your estimate…",
  "Line items are cooking…",
  "This chat updates when the draft lands…",
] as const;

export type JarvisWorkingMode = "general" | "estimate" | "preparing" | "draft_poll";

function linesFor(mode: JarvisWorkingMode): readonly string[] {
  switch (mode) {
    case "estimate":
      return ESTIMATE_LINES;
    case "preparing":
      return PREPARE_LINES;
    case "draft_poll":
      return DRAFT_POLL_LINES;
    default:
      return GENERAL_LINES;
  }
}

function BouncingDots() {
  return (
    <span className="inline-flex items-end gap-0.5 px-0.5" aria-hidden>
      <span className="wci-jarvis-dot h-1.5 w-1.5 rounded-full" style={{ background: "var(--bt-primary)", animationDelay: "0ms" }} />
      <span className="wci-jarvis-dot h-1.5 w-1.5 rounded-full" style={{ background: "var(--bt-primary)", animationDelay: "160ms" }} />
      <span className="wci-jarvis-dot h-1.5 w-1.5 rounded-full" style={{ background: "var(--bt-primary)", animationDelay: "320ms" }} />
    </span>
  );
}

function Spinner() {
  return (
    <span
      className="wci-jarvis-spin inline-block h-4 w-4 shrink-0 rounded-full border-2"
      style={{
        borderColor: "color-mix(in srgb, var(--bt-primary) 25%, transparent)",
        borderTopColor: "var(--bt-primary)",
      }}
      aria-hidden
    />
  );
}

export function JarvisWorkingIndicator({
  mode = "general",
  funUi = false,
  compact = false,
}: {
  readonly mode?: JarvisWorkingMode;
  readonly funUi?: boolean;
  readonly compact?: boolean;
}) {
  const lines = linesFor(mode);
  const [index, setIndex] = useState(0);

  // Remount via key={mode} from the parent resets index; only the interval lives here.
  useEffect(() => {
    if (lines.length <= 1) return;
    const timer = window.setInterval(() => {
      setIndex((current) => (current + 1) % lines.length);
    }, 2_400);
    return () => window.clearInterval(timer);
  }, [lines]);

  const label = lines[index % lines.length] ?? lines[0] ?? "Working…";

  return (
    <div
      className={`flex justify-start ${compact ? "" : ""}`}
      role="status"
      aria-live="polite"
      aria-busy="true"
      data-jarvis-working="true"
    >
      <div
        className={`wci-jarvis-working-pulse flex max-w-[90%] items-center gap-2 rounded-lg text-[var(--bt-text)] ${
          compact ? "px-2.5 py-1.5 text-xs" : "px-3 py-2 text-sm"
        }`}
        style={{
          background: "var(--bt-panel-bg-muted)",
          border: "1px solid color-mix(in srgb, var(--bt-primary) 28%, var(--bt-border))",
        }}
      >
        {funUi ? <JarvisMascot expression="thinking" size={compact ? 22 : 26} badge /> : <Spinner />}
        <span className="min-w-0 flex-1 font-medium" style={{ color: "var(--bt-primary)" }}>
          {label}
        </span>
        <BouncingDots />
      </div>
    </div>
  );
}
