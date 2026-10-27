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
 *
 * Confirm/Decline for pending actions and polling for async draft_lead_proposal
 * worker replies also live here so the Handy-style notes → estimate → proposal
 * flow can finish without forcing a trip to the full /jarvis page.
 */

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";

import {
  confirmPendingActionLauncherAction,
  declinePendingActionLauncherAction,
  refreshJarvisLauncherConversationAction,
  sendJarvisLauncherMessageAction,
  type LauncherActionState,
  type LauncherPendingActionData,
} from "@/app/jarvis/actions";
import { prepareJarvisAttachments } from "@/lib/client/prepare-jarvis-attachments";
import { JarvisMascot } from "@/components/jarvis/JarvisMascot";
import { JarvisVoiceButton } from "@/components/jarvis/JarvisVoiceButton";
import { useFunUi } from "@/components/jarvis/useFunUi";
import { JARVIS_SUGGESTIONS } from "@/lib/jarvis/suggestions";

const STORAGE_KEY_PREFIX = "jarvis-chat-conversation-id";
const DRAFT_POLL_MS = 4_000;

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

function isWaitingOnAsyncDraft(messages: readonly { role: string; content: string }[]): boolean {
  const lastAssistant = [...messages].reverse().find((message) => message.role === "ASSISTANT");
  if (!lastAssistant) return false;
  return (
    lastAssistant.content.includes("Queued that up") ||
    lastAssistant.content.includes("I'll post the result right here")
  );
}

function EmbeddedPendingActionCard({
  conversationId,
  action,
  onResolved,
}: {
  conversationId: string;
  action: LauncherPendingActionData;
  onResolved: (state: LauncherActionState) => void;
}) {
  const [confirmPending, startConfirm] = useTransition();
  const [declinePending, startDecline] = useTransition();

  if (action.status === "PENDING") {
    return (
      <div className="rounded-lg border border-amber-300 bg-amber-50 px-2.5 py-2 text-xs text-amber-950">
        <div className="text-[10px] font-semibold uppercase tracking-wide text-amber-700">Waiting on your confirmation</div>
        <p className="mt-1 text-sm">{action.summary}</p>
        <div className="mt-2 flex gap-2">
          <button
            type="button"
            disabled={confirmPending || declinePending}
            onClick={() => {
              const formData = new FormData();
              formData.set("conversationId", conversationId);
              formData.set("actionId", action.id);
              startConfirm(async () => {
                const next = await confirmPendingActionLauncherAction({}, formData);
                onResolved(next);
              });
            }}
            className="rounded bg-amber-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-amber-700 disabled:opacity-50"
          >
            {confirmPending ? "…" : "Confirm"}
          </button>
          <button
            type="button"
            disabled={confirmPending || declinePending}
            onClick={() => {
              const formData = new FormData();
              formData.set("conversationId", conversationId);
              formData.set("actionId", action.id);
              startDecline(async () => {
                const next = await declinePendingActionLauncherAction({}, formData);
                onResolved(next);
              });
            }}
            className="rounded border border-amber-400 px-2.5 py-1 text-xs font-medium text-amber-900 hover:bg-amber-100 disabled:opacity-50"
          >
            {declinePending ? "…" : "Decline"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className="rounded-lg border px-2.5 py-2 text-xs"
      style={
        action.status === "CONFIRMED"
          ? {
              borderColor: "color-mix(in srgb, var(--bt-success) 35%, transparent)",
              background: "color-mix(in srgb, var(--bt-success) 14%, transparent)",
              color: "var(--bt-success)",
            }
          : { borderColor: "var(--bt-border)", background: "var(--bt-panel-bg-muted)", color: "var(--bt-muted)" }
      }
    >
      <div className="text-[10px] font-semibold uppercase tracking-wide">
        {action.status === "CONFIRMED" ? "Confirmed" : "Declined"}
      </div>
      <p className="mt-1 text-sm">{action.resultSummary ?? action.summary}</p>
    </div>
  );
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
  // Confirm/Decline/poll refresh land here; cleared when the user sends a new message
  // so useActionState's reply wins without an effect that resets on every send.
  const [overlayState, setOverlayState] = useState<LauncherActionState | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  // Bumped on each send so an in-flight draft poll can't overwrite the new reply.
  const sendEpochRef = useRef(0);
  // Covers compressing photos in the browser, which happens before formAction (and
  // therefore useActionState's own `pending`) ever starts — see chat-input-form.tsx's
  // identical note.
  const [preparing, setPreparing] = useState(false);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  const [, startRefresh] = useTransition();
  // useActionState's dispatch must run inside a transition (or as a form action /
  // formAction prop). Calling it after async attachment prep used to happen outside
  // one — React then warned and `pending` stayed false, so the UI looked idle while
  // the server action was still running (or appeared stuck on long drafts).
  const [, startSend] = useTransition();

  // After a send, `state` is authoritative (overlay was cleared in the form submit).
  // After Confirm/Decline/async-draft poll, overlay holds the fresher snapshot.
  const viewState =
    overlayState && (!state.conversationId || overlayState.conversationId === state.conversationId)
      ? { ...state, ...overlayState }
      : state;

  useEffect(() => {
    if (viewState.conversationId) sessionStorage.setItem(storageKeyFull, viewState.conversationId);
  }, [viewState.conversationId, storageKeyFull]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [viewState.messages, viewState.pendingActions]);

  useEffect(() => {
    onPendingChange?.(pending);
  }, [pending, onPendingChange]);

  const messages = viewState.messages ?? [];
  const pendingActions = viewState.pendingActions ?? [];
  const pendingCount = viewState.pendingCount ?? pendingActions.filter((action) => action.status === "PENDING").length;
  const conversationId = viewState.conversationId;
  const waitingOnDraft = isWaitingOnAsyncDraft(messages);

  useEffect(() => {
    if (!conversationId || !waitingOnDraft || pending) return;
    const epochAtStart = sendEpochRef.current;
    const timer = window.setInterval(() => {
      startRefresh(async () => {
        const next = await refreshJarvisLauncherConversationAction(conversationId);
        if (sendEpochRef.current === epochAtStart) setOverlayState(next);
      });
    }, DRAFT_POLL_MS);
    return () => window.clearInterval(timer);
  }, [conversationId, waitingOnDraft, pending]);

  function fillSuggestion(suggestion: string) {
    const textarea = formRef.current?.elements.namedItem("text");
    if (textarea instanceof HTMLTextAreaElement) {
      textarea.value = suggestion;
      textarea.focus();
    }
  }

  function appendVoiceTranscript(text: string) {
    const textarea = formRef.current?.elements.namedItem("text");
    if (textarea instanceof HTMLTextAreaElement) {
      textarea.value = textarea.value ? `${textarea.value} ${text}` : text;
      textarea.focus();
    }
  }

  // Fires once dictation stops with something actually said — sends it straight to
  // Jarvis, the same as tapping Send, so talking is the whole interaction rather
  // than dictate-then-remember-to-submit.
  function sendVoiceMessage() {
    formRef.current?.requestSubmit();
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
          {funUi ? <JarvisMascot expression={pending ? "thinking" : "happy"} size={28} tone="light" /> : <span>✦</span>} Jarvis
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
        {messages.length === 0 && pendingActions.length === 0 ? (
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
          <>
            {messages.map((message) => (
              <div key={message.id} className={`flex ${message.role === "USER" ? "justify-end" : "justify-start"}`}>
                <div
                  className="max-w-[85%] whitespace-pre-wrap rounded-lg px-3 py-2 text-sm"
                  style={
                    message.role === "USER"
                      ? { background: "var(--bt-primary)", color: "var(--bt-on-primary)" }
                      : { background: "var(--bt-panel-bg-muted)", color: "var(--bt-text)" }
                  }
                >
                  {message.content}
                </div>
              </div>
            ))}
            {conversationId
              ? pendingActions.map((action) => (
                  <div key={action.id} className="flex justify-start">
                    <div className="max-w-[85%]">
                      <EmbeddedPendingActionCard
                        conversationId={conversationId}
                        action={action}
                        onResolved={setOverlayState}
                      />
                    </div>
                  </div>
                ))
              : null}
          </>
        )}
        {pending ? (
          <div className="flex items-center gap-2 justify-start">
            {funUi ? <JarvisMascot expression="thinking" size={26} badge /> : null}
            <div className="max-w-[85%] rounded-lg px-3 py-2 text-sm text-[var(--bt-muted)]" style={{ background: "var(--bt-panel-bg-muted)" }}>
              Jarvis is thinking…
            </div>
          </div>
        ) : null}
        {waitingOnDraft && !pending ? (
          <p className="text-center text-xs text-[var(--bt-muted)]">Still drafting — this chat will update when it finishes…</p>
        ) : null}
        {pendingCount > 0 && conversationId && pendingActions.length === 0 ? (
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
        action={async (formData) => {
          setAttachmentError(null);
          sendEpochRef.current += 1;
          setOverlayState(null);
          setPreparing(true);
          const prepared = await prepareJarvisAttachments(formData).finally(() => setPreparing(false));
          if (prepared.error) {
            setAttachmentError(prepared.error);
            return;
          }
          startSend(() => {
            formAction(prepared.formData);
          });
          formRef.current?.reset();
        }}
        className="flex flex-col gap-1.5 border-t p-2.5"
        style={{ borderColor: "var(--bt-border)" }}
      >
        {conversationId ? <input type="hidden" name="conversationId" value={conversationId} /> : null}
        <input type="hidden" name="context" value={context ? JSON.stringify(context) : ""} />
        <JarvisVoiceButton onTranscript={appendVoiceTranscript} onFinish={sendVoiceMessage} funUi={funUi} />
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
            disabled={pending || preparing}
            className={`px-3.5 text-xs font-semibold text-[var(--bt-on-primary)] disabled:opacity-50 disabled:shadow-none ${funUi ? "wci-fun-chunky-btn rounded-xl py-2.5 active:scale-95" : "rounded py-1.5"}`}
            style={{ background: "var(--bt-primary)" }}
          >
            {preparing ? "…" : pending ? "…" : "Send"}
          </button>
        </div>
        <label className="flex items-center gap-1.5 text-xs text-[var(--bt-muted)]">
          <span>Attach photos:</span>
          <input type="file" name="attachments" multiple accept="image/jpeg,image/png,image/webp,image/gif" className="text-xs" />
        </label>
      </form>
      {preparing ? <p className="px-2.5 pb-2 text-xs text-[var(--bt-muted)]">Preparing photos…</p> : null}
      {attachmentError ?? viewState.error ? (
        <p className="px-2.5 pb-2 text-xs text-red-600">{attachmentError ?? viewState.error}</p>
      ) : null}
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
