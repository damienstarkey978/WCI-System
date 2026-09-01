"use client";

/**
 * The actual chat UI shared by the floating docked launcher (JarvisLauncher.tsx) and
 * any inline embedding of Jarvis on a page (e.g. a Lead's Proposals tab) — same
 * message history, same composer, same context injection (Part 3.2), just a
 * different outer frame. Extracted so "talk directly to Jarvis, and he talks back"
 * works the same way everywhere instead of each surface reinventing its own
 * single-shot form: type a message, Jarvis replies with real text (and, when it
 * calls a tool like draft_lead_proposal, a plain-language confirmation + link —
 * never a silent redirect).
 */

import { useActionState, useEffect, useRef, useState } from "react";
import Link from "next/link";

import { sendJarvisLauncherMessageAction, type LauncherActionState } from "@/app/jarvis/actions";
import { JarvisMascot } from "@/components/jarvis/JarvisMascot";
import { useFunUi } from "@/components/jarvis/useFunUi";
import { JARVIS_SUGGESTIONS } from "@/lib/jarvis/suggestions";

const STORAGE_KEY_PREFIX = "jarvis-chat-conversation-id";

interface JarvisChatPanelProps {
  readonly context: Record<string, unknown> | null;
  /** Distinguishes this embedding's remembered conversation from others (e.g. the
   *  floating launcher vs. a specific lead's inline chat) so switching leads doesn't
   *  resume a different lead's conversation. Defaults to "default" (the launcher). */
  readonly storageKey?: string;
  readonly suggestions?: readonly string[];
  readonly emptyStateHint?: string;
  readonly onClose?: () => void;
  readonly heightClassName?: string;
  /** Lets an embedding (JarvisLauncher's docked button) react to a request being in
   *  flight — e.g. swap the mascot's face to "thinking" — without lifting the whole
   *  useActionState up. */
  readonly onPendingChange?: (pending: boolean) => void;
}

function JarvisChatBody({
  context,
  storageKeyFull,
  suggestions,
  emptyStateHint,
  onClose,
  onNewChat,
  heightClassName,
  onPendingChange,
}: {
  context: Record<string, unknown> | null;
  storageKeyFull: string;
  suggestions: readonly string[];
  emptyStateHint: string;
  onClose?: () => void;
  onNewChat: () => void;
  heightClassName: string;
  onPendingChange?: (pending: boolean) => void;
}) {
  const funUi = useFunUi();
  const [initialConversationId] = useState<string | undefined>(() =>
    typeof window !== "undefined" ? (sessionStorage.getItem(storageKeyFull) ?? undefined) : undefined,
  );
  const [state, formAction, pending] = useActionState<LauncherActionState, FormData>(sendJarvisLauncherMessageAction, {
    conversationId: initialConversationId,
  });
  const formRef = useRef<HTMLFormElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (state.conversationId) sessionStorage.setItem(storageKeyFull, state.conversationId);
  }, [state.conversationId, storageKeyFull]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [state.messages]);

  useEffect(() => {
    onPendingChange?.(pending);
  }, [pending, onPendingChange]);

  const messages = state.messages ?? [];
  const pendingCount = state.pendingCount ?? 0;
  const conversationId = state.conversationId;

  function fillSuggestion(suggestion: string) {
    const textarea = formRef.current?.elements.namedItem("text");
    if (textarea instanceof HTMLTextAreaElement) {
      textarea.value = suggestion;
      textarea.focus();
    }
  }

  return (
    <div
      className={`flex ${heightClassName} w-full flex-col overflow-hidden border bg-[var(--bt-panel-bg)] ${funUi ? "rounded-3xl border-2" : "rounded-lg"}`}
      style={{ borderColor: funUi ? "var(--bt-primary)" : "var(--bt-border)" }}
    >
      <div
        className={funUi ? "flex items-center justify-between px-4 py-3" : "flex items-center justify-between border-b px-3 py-2"}
        style={
          funUi
            ? { background: "linear-gradient(135deg, var(--bt-primary), var(--bt-nav))" }
            : { borderColor: "var(--bt-border)" }
        }
      >
        <span
          className={
            funUi
              ? "wci-fun-heading flex items-center gap-1.5 text-base font-semibold text-white"
              : "flex items-center gap-1.5 text-sm font-semibold text-[var(--bt-text)]"
          }
        >
          {funUi ? <JarvisMascot expression={pending ? "thinking" : "happy"} size={22} tone="light" /> : <span>✦</span>} Jarvis
        </span>
        <div className={funUi ? "flex items-center gap-3 text-xs text-white/90" : "flex items-center gap-2.5 text-xs"}>
          <button type="button" onClick={onNewChat} className={funUi ? "hover:underline" : "text-[var(--bt-muted)] hover:underline"}>
            New chat
          </button>
          {conversationId ? (
            <Link href={`/jarvis/${conversationId}`} className={funUi ? "font-semibold hover:underline" : "text-[var(--bt-primary)] hover:underline"}>
              Full view
            </Link>
          ) : null}
          {onClose ? (
            <button
              type="button"
              onClick={onClose}
              aria-label="Close Jarvis"
              className={funUi ? "text-lg leading-none hover:text-white" : "text-[var(--bt-muted)] hover:text-[var(--bt-text)]"}
            >
              ✕
            </button>
          ) : null}
        </div>
      </div>

      <div ref={scrollRef} className="flex flex-1 flex-col gap-2 overflow-y-auto p-3">
        {messages.length === 0 ? (
          <div className="flex flex-1 flex-col justify-center gap-2">
            <p className="text-center text-sm text-[var(--bt-muted)]">{emptyStateHint}</p>
            {suggestions.length > 0 ? (
              <div className="mt-2 flex flex-col gap-1.5">
                {suggestions.map((suggestion) => (
                  <button
                    key={suggestion}
                    type="button"
                    onClick={() => fillSuggestion(suggestion)}
                    className="rounded border px-2.5 py-1.5 text-left text-xs text-[var(--bt-text)] hover:bg-black/5"
                    style={{ borderColor: "var(--bt-border)" }}
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        ) : (
          messages.map((message) => (
            <div key={message.id} className={`flex ${message.role === "USER" ? "justify-end" : "justify-start"}`}>
              <div
                className="max-w-[85%] whitespace-pre-wrap rounded-lg px-3 py-2 text-sm"
                style={
                  message.role === "USER"
                    ? { background: "var(--bt-primary)", color: "white" }
                    : { background: "var(--bt-panel-bg-muted)", color: "var(--bt-text)" }
                }
              >
                {message.content}
              </div>
            </div>
          ))
        )}
        {pending ? (
          <div className="flex items-center gap-2 justify-start">
            {funUi ? <JarvisMascot expression="thinking" size={26} badge /> : null}
            <div className="max-w-[85%] rounded-lg px-3 py-2 text-sm text-[var(--bt-muted)]" style={{ background: "var(--bt-panel-bg-muted)" }}>
              Jarvis is thinking…
            </div>
          </div>
        ) : null}
        {pendingCount > 0 && conversationId ? (
          <div className="rounded border border-amber-300 bg-amber-50 px-2.5 py-1.5 text-xs text-amber-900">
            {pendingCount} action{pendingCount === 1 ? "" : "s"} waiting on your confirmation —{" "}
            <Link href={`/jarvis/${conversationId}`} className="font-semibold hover:underline">
              review in full conversation
            </Link>
            .
          </div>
        ) : null}
      </div>

      <form
        ref={formRef}
        action={(formData) => {
          formAction(formData);
          formRef.current?.reset();
        }}
        className="flex flex-col gap-1.5 border-t p-2.5"
        style={{ borderColor: "var(--bt-border)" }}
      >
        {conversationId ? <input type="hidden" name="conversationId" value={conversationId} /> : null}
        <input type="hidden" name="context" value={context ? JSON.stringify(context) : ""} />
        <div className="flex items-end gap-2">
          <textarea
            name="text"
            required
            rows={2}
            placeholder="Ask Jarvis…"
            // text-base (16px), not text-sm — iOS Safari auto-zooms the page on focus
            // for any input under 16px, which on a phone shoves the whole layout
            // sideways the moment you tap in to type.
            className={`flex-1 resize-none border px-2.5 py-2 text-base outline-none focus:border-[var(--bt-primary)] ${funUi ? "rounded-xl" : "rounded"}`}
            style={{ borderColor: "var(--bt-border)" }}
          />
          <button
            type="submit"
            disabled={pending}
            className={`px-3.5 text-xs font-semibold text-white disabled:opacity-50 disabled:shadow-none ${funUi ? "wci-fun-chunky-btn rounded-xl py-2.5 active:scale-95" : "rounded py-1.5"}`}
            style={{ background: "var(--bt-primary)" }}
          >
            {pending ? "…" : "Send"}
          </button>
        </div>
        <label className="flex items-center gap-1.5 text-xs text-[var(--bt-muted)]">
          <span>Attach photos:</span>
          <input type="file" name="attachments" multiple accept="image/jpeg,image/png,image/webp,image/gif" className="text-xs" />
        </label>
      </form>
      {state.error ? <p className="px-2.5 pb-2 text-xs text-red-600">{state.error}</p> : null}
    </div>
  );
}

/** Keyed by chatKey so "New chat" gets a clean useActionState by remounting, rather
 *  than mirroring server state into local state (which would need syncing in an
 *  effect — see JarvisLauncher.tsx's original note on this). */
export function JarvisChatPanel({
  context,
  storageKey = "default",
  suggestions = JARVIS_SUGGESTIONS,
  emptyStateHint = "Ask Jarvis to look up a job, draft a change order, log a note, or queue an invoice or proposal to send — it can't send anything client-facing without your confirmation first.",
  onClose,
  heightClassName = "h-[32rem]",
  onPendingChange,
}: JarvisChatPanelProps) {
  const [chatKey, setChatKey] = useState(0);
  const storageKeyFull = `${STORAGE_KEY_PREFIX}:${storageKey}`;

  function startNewChat() {
    sessionStorage.removeItem(storageKeyFull);
    setChatKey((key) => key + 1);
  }

  return (
    <JarvisChatBody
      key={chatKey}
      context={context}
      storageKeyFull={storageKeyFull}
      suggestions={suggestions}
      onPendingChange={onPendingChange}
      emptyStateHint={emptyStateHint}
      onClose={onClose}
      onNewChat={startNewChat}
      heightClassName={heightClassName}
    />
  );
}
