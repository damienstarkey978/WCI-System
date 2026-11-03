"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";

import { JarvisAskComposer } from "@/components/jarvis/JarvisAskComposer";
import { JarvisWorkingIndicator } from "@/components/jarvis/JarvisWorkingIndicator";
import { useFunUi } from "@/components/jarvis/useFunUi";
import { prepareJarvisAttachments } from "@/lib/client/prepare-jarvis-attachments";
import { JARVIS_SUGGESTIONS } from "@/lib/jarvis/suggestions";

import { sendJarvisMessageAction, type ActionState } from "./actions";

const INITIAL: ActionState = {};

export function ChatInputForm({ conversationId, showSuggestions }: { conversationId?: string; showSuggestions?: boolean }) {
  const [state, formAction, pending] = useActionState(sendJarvisMessageAction, INITIAL);
  const formRef = useRef<HTMLFormElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const funUi = useFunUi();
  const [sendPending, startSend] = useTransition();
  // Separate from `pending`: this covers compressing photos in the browser, which
  // happens *before* formAction (and therefore useActionState's own pending flag)
  // ever starts — without it, attaching a big batch of photos looks like nothing is
  // happening for however long the compression takes.
  const [preparing, setPreparing] = useState(false);
  const [requestInFlight, setRequestInFlight] = useState(false);
  // Set when a batch is rejected before it's ever submitted (too many photos, still
  // too large after compression) — shown the same way as a server-side error, but
  // without the round trip that error would otherwise cost.
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  const working = preparing || pending || sendPending || requestInFlight;

  useEffect(() => {
    if (!requestInFlight) return;
    if (preparing || pending || sendPending) return;
    const timer = window.setTimeout(() => setRequestInFlight(false), 0);
    return () => window.clearTimeout(timer);
  }, [requestInFlight, preparing, pending, sendPending, state]);

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

  return (
    <>
      {working ? (
        <div className="px-4 pt-3">
          <JarvisWorkingIndicator mode={preparing ? "preparing" : "general"} funUi={funUi} />
        </div>
      ) : null}
      {showSuggestions ? (
        <div className="flex flex-wrap gap-1.5 border-t px-3 pt-3" style={{ borderColor: "var(--bt-border)" }}>
          {JARVIS_SUGGESTIONS.map((suggestion) => (
            <button
              key={suggestion}
              type="button"
              onClick={() => fillSuggestion(suggestion)}
              className="rounded-full border px-3 py-1 text-xs text-[var(--bt-text)] hover:bg-black/5"
              style={{ borderColor: "var(--bt-border)" }}
            >
              {suggestion}
            </button>
          ))}
        </div>
      ) : null}
      <JarvisAskComposer
        formRef={formRef}
        fileInputRef={fileInputRef}
        conversationId={conversationId}
        placeholder="Ask Jarvis"
        pending={working}
        preparing={preparing}
        funUi={funUi}
        rows={2}
        onTranscript={appendVoiceTranscript}
        onSubmit={async (formData) => {
          setAttachmentError(null);
          setRequestInFlight(true);
          setPreparing(true);
          const prepared = await prepareJarvisAttachments(formData).finally(() => setPreparing(false));
          if (prepared.error) {
            setAttachmentError(prepared.error);
            setRequestInFlight(false);
            return;
          }
          startSend(() => {
            formAction(prepared.formData);
          });
          formRef.current?.reset();
        }}
        footer={
          attachmentError ?? state.error ? (
            <p role="alert" className="text-xs text-red-600">
              {attachmentError ?? state.error}
            </p>
          ) : null
        }
      />
    </>
  );
}
