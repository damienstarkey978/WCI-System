"use client";

/**
 * Phone-width counterpart to conversation-sidebar.tsx's persistent 256px column,
 * which is hidden below `md` (same convention as JobSidebar — CLAUDE.md's mobile
 * pass, src/components/shell/MobileMenuDrawer.tsx) because a fixed side column has
 * no reasonable place on a phone screen when the chat itself needs the full width.
 * Unlike the job list, conversation history has no other mobile entry point, so
 * this trades the always-visible column for an off-canvas drawer instead of
 * dropping the feature outright.
 */

import Link from "next/link";
import { useState } from "react";

import { formatDate } from "@/lib/format";
import { CloseIcon, HistoryIcon } from "@/components/shell/icons";

export interface MobileConversationSummary {
  readonly id: string;
  readonly title: string | null;
  readonly updatedAt: Date;
}

export function MobileConversationDrawer({
  conversations,
  activeConversationId,
}: {
  conversations: readonly MobileConversationSummary[];
  activeConversationId?: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="md:hidden">
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Conversation history"
        title="Conversation history"
        className="flex w-full items-center gap-1.5 border-b px-3 py-2 text-left text-xs font-semibold text-[var(--bt-muted)]"
        style={{ borderColor: "var(--bt-border)" }}
      >
        <HistoryIcon className="h-4 w-4" /> History
      </button>

      {open ? (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 left-0 flex w-[85vw] max-w-sm flex-col bg-[var(--bt-panel-bg)] shadow-xl">
            <div className="flex items-center justify-between border-b px-4 py-3" style={{ borderColor: "var(--bt-border)" }}>
              <span className="text-sm font-semibold text-[var(--bt-text)]">Conversations</span>
              <button type="button" onClick={() => setOpen(false)} aria-label="Close" className="rounded p-1.5 text-[var(--bt-muted)] hover:bg-black/5">
                <CloseIcon className="h-5 w-5" />
              </button>
            </div>
            <div className="flex flex-col gap-1 overflow-y-auto p-3">
              <Link
                href="/jarvis"
                onClick={() => setOpen(false)}
                className="rounded px-3 py-2 text-sm font-semibold text-white"
                style={{ background: "var(--bt-primary)" }}
              >
                + New chat
              </Link>
              {conversations.length === 0 ? (
                <p className="px-2 py-4 text-xs text-[var(--bt-muted)]">No conversations yet.</p>
              ) : (
                conversations.map((conversation) => (
                  <Link
                    key={conversation.id}
                    href={`/jarvis/${conversation.id}`}
                    onClick={() => setOpen(false)}
                    className={`rounded px-3 py-2 text-sm ${conversation.id === activeConversationId ? "bg-black/5 font-semibold" : ""}`}
                    style={{ color: conversation.id === activeConversationId ? "var(--bt-text)" : "var(--bt-muted)" }}
                  >
                    <div className="truncate">{conversation.title ?? "New conversation"}</div>
                    <div className="text-[10px] text-[var(--bt-muted)]">{formatDate(conversation.updatedAt)}</div>
                  </Link>
                ))
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
