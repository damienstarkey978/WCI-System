"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

import { CreateModal } from "@/components/shell/CreateModal";
import { ChevronDownIcon, GearIcon, ShareIcon } from "@/components/shell/icons";

import type { StaffOption } from "./task-detail-drawer";
import { TodoForm } from "./todo-form";

/** Buildertrend footer ⋯ (horizontal ellipsis), not the hamburger MenuIcon. */
function EllipsisIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" className={className} aria-hidden>
      <circle cx="4" cy="10" r="1.5" />
      <circle cx="10" cy="10" r="1.5" />
      <circle cx="16" cy="10" r="1.5" />
    </svg>
  );
}

/**
 * Buildertrend Tasks header chrome: ⋯ more menu, gear, and split "+ Task"
 * (main click opens create modal; chevron lists Import options as chrome-only).
 */
export function TasksToolbar({ jobId, staff }: { jobId: string; staff: readonly StaffOption[] }) {
  const [moreOpen, setMoreOpen] = useState(false);
  const [splitOpen, setSplitOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);
  const splitRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!moreOpen && !splitOpen) return;
    function onDoc(event: MouseEvent) {
      if (moreRef.current && !moreRef.current.contains(event.target as Node)) setMoreOpen(false);
      if (splitRef.current && !splitRef.current.contains(event.target as Node)) setSplitOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [moreOpen, splitOpen]);

  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      <div className="flex items-center gap-1">
        <div className="relative" ref={moreRef}>
          <button
            type="button"
            aria-label="More task actions"
            aria-expanded={moreOpen}
            onClick={() => {
              setMoreOpen((open) => !open);
              setSplitOpen(false);
            }}
            className="inline-flex h-9 w-9 items-center justify-center rounded border bg-[var(--bt-panel-bg)] text-[var(--bt-muted)] hover:bg-black/5"
            style={{ borderColor: "var(--bt-border)" }}
          >
            <EllipsisIcon className="h-4 w-4" />
          </button>
          {moreOpen ? (
            <div
              className="absolute right-0 top-full z-20 mt-1 min-w-[13.5rem] overflow-hidden rounded-md border bg-[var(--bt-panel-bg)] py-1 shadow-lg"
              style={{ borderColor: "var(--bt-border)" }}
              role="menu"
            >
              <ChromeMenuItem label="Feedback" muted />
              <ChromeMenuItem label="View deleted tasks" muted />
              <ChromeMenuItem
                label="Share to assigned users"
                icon={<ShareIcon className="h-3.5 w-3.5" />}
                muted
              />
            </div>
          ) : null}
        </div>
        <span
          className="inline-flex h-9 w-9 items-center justify-center rounded border bg-[var(--bt-panel-bg)]"
          style={{ borderColor: "var(--bt-border)", color: "var(--bt-chrome-settings, #8b5cf6)" }}
          title="Settings"
          aria-hidden
        >
          <GearIcon className="h-4 w-4" />
        </span>
      </div>

      <div className="relative flex" ref={splitRef}>
        <button
          type="button"
          onClick={() => setCreateOpen(true)}
          className="inline-flex min-h-9 items-center rounded-l px-3 py-1.5 text-sm font-semibold text-[var(--bt-on-primary)]"
          style={{ background: "var(--bt-primary)" }}
        >
          + Task
        </button>
        <button
          type="button"
          aria-label="More new-task options"
          aria-expanded={splitOpen}
          onClick={() => {
            setSplitOpen((open) => !open);
            setMoreOpen(false);
          }}
          className="inline-flex min-h-9 items-center rounded-r border-l px-2 text-[var(--bt-on-primary)]"
          style={{ background: "var(--bt-primary)", borderColor: "color-mix(in srgb, white 28%, transparent)" }}
        >
          <ChevronDownIcon className="h-4 w-4" />
        </button>
        {splitOpen ? (
          <div
            className="absolute right-0 top-full z-20 mt-1 min-w-[12rem] overflow-hidden rounded-md border bg-[var(--bt-panel-bg)] py-1 shadow-lg"
            style={{ borderColor: "var(--bt-border)" }}
            role="menu"
          >
            <ChromeMenuItem label="Import from template" muted />
            <ChromeMenuItem label="Import from file" muted />
          </div>
        ) : null}
      </div>

      <CreateModal triggerLabel="+ Task" title="New task" open={createOpen} onOpenChange={setCreateOpen} hideTrigger>
        <TodoForm jobId={jobId} staff={staff} />
      </CreateModal>
    </div>
  );
}

function ChromeMenuItem({
  label,
  icon,
  muted,
}: {
  label: string;
  icon?: ReactNode;
  muted?: boolean;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      disabled={muted}
      title={muted ? "Coming soon" : undefined}
      className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm ${
        muted ? "cursor-default text-[var(--bt-muted)]" : "text-[var(--bt-text)] hover:bg-black/5"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}
