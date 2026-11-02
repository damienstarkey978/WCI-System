"use client";

import type { ReactNode } from "react";

/**
 * Rockstar-style create/edit shell: live PDF preview left, steps right.
 * WCI colors via CSS variables — no purple/marketing chrome.
 */
export function PackageWizardShell({
  title,
  subtitle,
  previewTitle,
  previewUrl,
  previewEmptyHint,
  children,
}: {
  readonly title: string;
  readonly subtitle?: string;
  readonly previewTitle: string;
  readonly previewUrl: string | null;
  readonly previewEmptyHint?: string;
  readonly children: ReactNode;
}) {
  return (
    <div
      className="overflow-hidden rounded-lg border"
      style={{ borderColor: "var(--bt-border)", background: "var(--bt-panel-bg)" }}
    >
      <div
        className="flex flex-wrap items-baseline justify-between gap-2 border-b px-3 py-2"
        style={{ borderColor: "var(--bt-border)" }}
      >
        <div>
          <h3 className="text-sm font-semibold text-[var(--bt-text)]">{title}</h3>
          {subtitle ? <p className="text-[11px] text-[var(--bt-muted)]">{subtitle}</p> : null}
        </div>
        <span className="text-[10px] font-medium uppercase tracking-wide text-[var(--bt-muted)]">
          WCI Permitting
        </span>
      </div>
      <div className="grid gap-0 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
        <div
          className="flex min-h-[22rem] flex-col border-b lg:border-b-0 lg:border-r"
          style={{ borderColor: "var(--bt-border)", background: "#f4f5f7" }}
        >
          <div
            className="border-b px-3 py-1.5 text-[11px] font-medium text-[var(--bt-muted)]"
            style={{ borderColor: "var(--bt-border)", background: "var(--bt-panel-bg)" }}
          >
            Live preview · {previewTitle}
          </div>
          <div className="relative min-h-[20rem] flex-1">
            {previewUrl ? (
              <iframe
                title={`Preview ${previewTitle}`}
                src={previewUrl}
                className="absolute inset-0 h-full w-full border-0 bg-white"
              />
            ) : (
              <div className="flex h-full min-h-[20rem] items-center justify-center px-6 text-center text-xs text-[var(--bt-muted)]">
                {previewEmptyHint ?? "Select a sourced form to preview the official blank."}
              </div>
            )}
          </div>
        </div>
        <div className="max-h-[36rem] overflow-y-auto p-3 sm:p-4">{children}</div>
      </div>
    </div>
  );
}
