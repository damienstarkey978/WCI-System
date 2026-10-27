"use client";

/**
 * Handoff Ask Handy–style composer chrome shared by JarvisChatPanel and the
 * full /jarvis chat form: textarea + toolbar with attach, mic, and circular send.
 * WCI colors (not dark-mode copy). Voice fills the input; Send submits.
 */

import { useId, type KeyboardEvent, type ReactNode, type RefObject } from "react";

import { JarvisVoiceButton } from "@/components/jarvis/JarvisVoiceButton";

function PaperclipIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M16.5 7.5 9.2 15a2.5 2.5 0 0 1-3.5-3.5l8-8a4 4 0 0 1 5.7 5.6l-8.5 8.5a5.5 5.5 0 0 1-7.8-7.8l7.4-7.4"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function SendArrowIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 19V5M12 5l-6 6M12 5l6 6"
        stroke="currentColor"
        strokeWidth="2.25"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function LocationPinIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 21s7-5.4 7-11a7 7 0 1 0-14 0c0 5.6 7 11 7 11Z"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="10" r="2.25" stroke="currentColor" strokeWidth="1.75" />
    </svg>
  );
}

export function JarvisAskComposer({
  formRef,
  fileInputRef,
  conversationId,
  contextJson,
  placeholder = "Ask Jarvis",
  pending,
  preparing,
  onSubmit,
  onTranscript,
  seedActions,
  footer,
  funUi = false,
  rows = 3,
  locationChip = null,
  compact = false,
}: {
  readonly formRef: RefObject<HTMLFormElement | null>;
  readonly fileInputRef: RefObject<HTMLInputElement | null>;
  readonly conversationId?: string | null;
  /** Serialized page context for the launcher/embedded panel; omit on /jarvis. */
  readonly contextJson?: string;
  readonly placeholder?: string;
  readonly pending: boolean;
  readonly preparing: boolean;
  readonly onSubmit: (formData: FormData) => void | Promise<void>;
  readonly onTranscript: (text: string) => void;
  readonly seedActions?: ReactNode;
  readonly footer?: ReactNode;
  readonly funUi?: boolean;
  readonly rows?: number;
  /** Handoff-style truncated address chip beside attach. */
  readonly locationChip?: string | null;
  /** Denser padding for the docked Handy rail. */
  readonly compact?: boolean;
}) {
  const inputId = useId();
  const busy = pending || preparing;
  const isMac =
    typeof navigator !== "undefined" && /Mac|iPhone|iPad|iPod/i.test(navigator.platform || navigator.userAgent);

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== "Enter") return;
    const withMeta = event.metaKey || event.ctrlKey;
    if (!withMeta) return;
    event.preventDefault();
    if (!busy) formRef.current?.requestSubmit();
  }

  return (
    <form
      ref={formRef}
      action={onSubmit}
      className={`flex flex-col gap-1.5 border-t ${compact ? "p-1.5" : "p-2 sm:p-2.5"}`}
      style={{ borderColor: "var(--bt-border)" }}
    >
      {conversationId ? <input type="hidden" name="conversationId" value={conversationId} /> : null}
      {contextJson !== undefined ? <input type="hidden" name="context" value={contextJson} /> : null}
      {seedActions}

      <div
        className={`overflow-hidden border bg-[var(--bt-panel-bg)] ${funUi ? "rounded-2xl border-2" : "rounded-xl"}`}
        style={{ borderColor: funUi ? "var(--bt-primary)" : "var(--bt-border)" }}
      >
        <label className="sr-only" htmlFor={inputId}>
          {placeholder}
        </label>
        <textarea
          id={inputId}
          name="text"
          required
          rows={rows}
          placeholder={placeholder}
          disabled={busy}
          onKeyDown={handleKeyDown}
          // text-base (16px) — iOS Safari auto-zooms inputs under 16px.
          className={`block w-full resize-none border-0 bg-transparent px-3 text-base text-[var(--bt-text)] outline-none placeholder:text-[var(--bt-muted)] disabled:opacity-60 ${
            compact ? "pb-0.5 pt-2" : "pb-1 pt-2.5"
          }`}
        />
        {!compact ? (
          <p className="hidden px-3 pb-1 text-[10px] text-[var(--bt-muted)] sm:block">
            Use {isMac ? "⌘" : "Ctrl"} + Return to submit
          </p>
        ) : null}

        <div className={`flex items-center gap-1 px-1.5 pt-0.5 ${compact ? "pb-1" : "pb-1.5"}`}>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={busy}
            aria-label="Attach photos"
            title="Attach photos"
            className="inline-flex h-10 w-10 shrink-0 touch-manipulation items-center justify-center rounded-full text-[var(--bt-muted)] transition hover:bg-black/5 hover:text-[var(--bt-text)] disabled:cursor-not-allowed disabled:opacity-40 sm:h-9 sm:w-9"
          >
            <PaperclipIcon />
          </button>

          <input
            ref={fileInputRef}
            type="file"
            name="attachments"
            multiple
            accept="image/jpeg,image/png,image/webp,image/gif"
            className="sr-only"
            tabIndex={-1}
          />

          {locationChip ? (
            <span
              className="inline-flex max-w-[7.5rem] items-center gap-0.5 truncate rounded-full border px-1.5 py-0.5 text-[10px] font-medium text-[var(--bt-muted)]"
              style={{ borderColor: "var(--bt-border)", background: "var(--bt-panel-bg-muted)" }}
              title={locationChip}
            >
              <LocationPinIcon />
              <span className="truncate">{locationChip}</span>
            </span>
          ) : null}

          <div className="min-w-0 flex-1" />

          <JarvisVoiceButton onTranscript={onTranscript} disabled={busy} />

          <button
            type="submit"
            disabled={busy}
            aria-label={preparing ? "Preparing" : pending ? "Sending" : "Send"}
            title="Send"
            className={`inline-flex h-10 w-10 shrink-0 touch-manipulation items-center justify-center rounded-full text-[var(--bt-on-primary)] transition disabled:opacity-50 sm:h-9 sm:w-9 ${
              funUi ? "active:scale-95" : "hover:opacity-90"
            }`}
            style={{ background: "var(--bt-primary)" }}
          >
            {busy ? (
              <span className="text-xs font-semibold" aria-hidden>
                …
              </span>
            ) : (
              <SendArrowIcon />
            )}
          </button>
        </div>
      </div>

      {footer}
    </form>
  );
}
