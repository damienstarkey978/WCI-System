"use client";

/**
 * The docked-everywhere entry point to Jarvis (handoff-ai-analysis-and-jarvis-deep-
 * integration-spec.md Part 3.1) — a floating launcher mounted in AppShell so it's on
 * every authenticated route, opening a slide-over panel instead of navigating to
 * /jarvis. The full /jarvis page still exists for conversation history/search; this
 * is the "don't lose what you were doing" path.
 *
 * Automatically attaches a `context` object describing the current route (Part 3.2)
 * so "draft a change order for this" resolves without the user naming the job —
 * see sendJarvisLauncherMessageAction, which folds it into the model's system prompt
 * for that turn and stores it on the message for the audit trail.
 *
 * Deliberately does not render pending-action confirm/decline controls (unlike the
 * full-page MessageList) — confirming a money-moving or client-facing action gets the
 * full page, not a corner popup; the panel just reports how many are waiting.
 */

import { useActionState, useEffect, useRef, useState } from "react";
import { usePathname, useParams } from "next/navigation";
import Link from "next/link";

import { sendJarvisLauncherMessageAction, type LauncherActionState } from "@/app/jarvis/actions";
import { JARVIS_SUGGESTIONS } from "@/lib/jarvis/suggestions";

const STORAGE_KEY = "jarvis-launcher-conversation-id";

function currentPageContext(pathname: string | null, params: Record<string, string | string[] | undefined>): Record<string, unknown> | null {
  if (!pathname || pathname.startsWith("/jarvis")) return null;

  const jobId = typeof params.jobId === "string" ? params.jobId : undefined;
  const leadId = typeof params.leadId === "string" ? params.leadId : undefined;
  const proposalId = typeof params.proposalId === "string" ? params.proposalId : undefined;
  const estimateId = typeof params.estimateId === "string" ? params.estimateId : undefined;
  const vendorId = typeof params.vendorId === "string" ? params.vendorId : undefined;
  const clientId = typeof params.clientId === "string" ? params.clientId : undefined;

  if (jobId) return { page: "job_detail", jobId, path: pathname };
  if (leadId) return { page: "lead_detail", leadId, path: pathname };
  if (proposalId) return { page: "proposal_detail", proposalId, path: pathname };
  if (estimateId) return { page: "estimate_detail", estimateId, path: pathname };
  if (vendorId) return { page: "vendor_detail", vendorId, path: pathname };
  if (clientId) return { page: "client_detail", clientId, path: pathname };
  return { page: "other", path: pathname };
}

/** Keyed by chatKey in the parent so "New chat" gets a clean useActionState by remounting,
 *  rather than mirroring server state into local state (which would need syncing in an effect). */
function JarvisPanelBody({
  context,
  onClose,
  onNewChat,
}: {
  context: Record<string, unknown> | null;
  onClose: () => void;
  onNewChat: () => void;
}) {
  const [initialConversationId] = useState<string | undefined>(() =>
    typeof window !== "undefined" ? (sessionStorage.getItem(STORAGE_KEY) ?? undefined) : undefined,
  );
  const [state, formAction, pending] = useActionState<LauncherActionState, FormData>(sendJarvisLauncherMessageAction, {
    conversationId: initialConversationId,
  });
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.conversationId) sessionStorage.setItem(STORAGE_KEY, state.conversationId);
  }, [state.conversationId]);

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
      className="fixed bottom-24 right-5 z-50 flex h-[32rem] w-96 max-w-[calc(100vw-2.5rem)] flex-col overflow-hidden rounded-lg border bg-white shadow-2xl"
      style={{ borderColor: "var(--bt-border)" }}
    >
      <div className="flex items-center justify-between border-b px-3 py-2" style={{ borderColor: "var(--bt-border)" }}>
        <span className="text-sm font-semibold text-[var(--bt-text)]">Jarvis</span>
        <div className="flex items-center gap-2.5 text-xs">
          <button type="button" onClick={onNewChat} className="text-[var(--bt-muted)] hover:underline">
            New chat
          </button>
          {conversationId ? (
            <Link href={`/jarvis/${conversationId}`} className="text-[var(--bt-primary)] hover:underline">
              Full view
            </Link>
          ) : null}
          <button type="button" onClick={onClose} aria-label="Close Jarvis" className="text-[var(--bt-muted)] hover:text-[var(--bt-text)]">
            ✕
          </button>
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-2 overflow-y-auto p-3">
        {messages.length === 0 ? (
          <div className="flex flex-1 flex-col justify-center gap-2">
            <p className="text-center text-sm text-[var(--bt-muted)]">
              Ask Jarvis to look up a job, draft a change order, log a note, or queue an invoice or proposal to send —
              it can&apos;t send anything client-facing without your confirmation first.
            </p>
            <div className="mt-2 flex flex-col gap-1.5">
              {JARVIS_SUGGESTIONS.map((suggestion) => (
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
          </div>
        ) : (
          messages.map((message) => (
            <div key={message.id} className={`flex ${message.role === "USER" ? "justify-end" : "justify-start"}`}>
              <div
                className="max-w-[85%] whitespace-pre-wrap rounded-lg px-3 py-2 text-sm"
                style={
                  message.role === "USER"
                    ? { background: "var(--bt-primary)", color: "white" }
                    : { background: "#f3f4f6", color: "var(--bt-text)" }
                }
              >
                {message.content}
              </div>
            </div>
          ))
        )}
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
        className="flex items-end gap-2 border-t p-2.5"
        style={{ borderColor: "var(--bt-border)" }}
      >
        {conversationId ? <input type="hidden" name="conversationId" value={conversationId} /> : null}
        <input type="hidden" name="context" value={context ? JSON.stringify(context) : ""} />
        <textarea
          name="text"
          required
          rows={2}
          placeholder="Ask Jarvis…"
          className="flex-1 resize-none rounded border px-2.5 py-1.5 text-sm outline-none focus:border-[var(--bt-primary)]"
          style={{ borderColor: "var(--bt-border)" }}
        />
        <button
          type="submit"
          disabled={pending}
          className="rounded px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
          style={{ background: "var(--bt-primary)" }}
        >
          {pending ? "…" : "Send"}
        </button>
      </form>
      {state.error ? <p className="px-2.5 pb-2 text-xs text-red-600">{state.error}</p> : null}
    </div>
  );
}

export function JarvisLauncher() {
  const [open, setOpen] = useState(false);
  const [chatKey, setChatKey] = useState(0);

  const pathname = usePathname();
  const rawParams = useParams();
  const context = currentPageContext(pathname, (rawParams ?? {}) as Record<string, string | string[] | undefined>);

  function startNewChat() {
    sessionStorage.removeItem(STORAGE_KEY);
    setChatKey((key) => key + 1);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-label="Ask Jarvis"
        title="Ask Jarvis"
        className="fixed bottom-5 right-5 z-50 flex h-14 w-14 items-center justify-center rounded-full text-2xl text-white shadow-lg transition hover:scale-105"
        style={{ background: "var(--bt-primary)" }}
      >
        ✦
      </button>

      {open ? (
        <JarvisPanelBody key={chatKey} context={context} onClose={() => setOpen(false)} onNewChat={startNewChat} />
      ) : null}
    </>
  );
}
