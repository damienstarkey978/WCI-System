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
import { useRouter } from "next/navigation";

import {
  confirmPendingActionLauncherAction,
  declinePendingActionLauncherAction,
  refreshJarvisLauncherConversationAction,
  sendJarvisLauncherMessageAction,
  type LauncherActionState,
  type LauncherPendingActionData,
} from "@/app/jarvis/actions";
import {
  findLeadPendingEstimateWorkspaceAction,
  loadLeadGeneralPhotosForJarvisAction,
} from "@/app/leads/[leadId]/jarvis-seed-actions";
import { prepareJarvisAttachments } from "@/lib/client/prepare-jarvis-attachments";
import { JarvisAskComposer } from "@/components/jarvis/JarvisAskComposer";
import { JarvisMascot } from "@/components/jarvis/JarvisMascot";
import { JarvisWorkingIndicator, type JarvisWorkingMode } from "@/components/jarvis/JarvisWorkingIndicator";
import { useFunUi } from "@/components/jarvis/useFunUi";
import {
  findEstimateWorkspaceHrefInMessages,
  isAsyncDraftFailureMessage,
  isWaitingOnAsyncDraft,
} from "@/lib/jarvis/estimate-workspace-nav";
import { JARVIS_SUGGESTIONS } from "@/lib/jarvis/suggestions";

const STORAGE_KEY_PREFIX = "jarvis-chat-conversation-id";
const DRAFT_POLL_MS = 4_000;
/** Inline Anthropic draft can take a while; past this we clear the spinner and offer retry. */
const TURN_TIMEOUT_MS = 180_000;
/** Async worker path — longer, but never spin forever on a dead poll. */
const DRAFT_POLL_TIMEOUT_MS = 300_000;

export interface JarvisGeneralPhotoSeed {
  readonly id: string;
  readonly fileName: string;
}

interface JarvisChatPanelProps {
  readonly context: Record<string, unknown> | null;
  /** Distinguishes this embedding's remembered conversation from others (e.g. the
   *  floating launcher vs. a specific lead's inline chat) so switching leads doesn't
   *  resume a different lead's conversation. Defaults to "default" (the launcher). */
  readonly storageKey?: string;
  readonly suggestions?: readonly string[];
  readonly emptyStateHint?: string;
  /** Placeholder for the Ask composer textarea (Handoff uses “Ask Handy”; WCI uses “Ask Jarvis”). */
  readonly composerPlaceholder?: string;
  readonly onClose?: () => void;
  readonly heightClassName?: string;
  /** Lets an embedding (JarvisLauncher's docked button) react to a request being in
   *  flight — e.g. swap the mascot's face to "thinking" — without lifting the whole
   *  useActionState up. */
  readonly onPendingChange?: (pending: boolean) => void;
  /** Lead Proposals: General-tab Lead.notes for the "Use General notes" button. */
  readonly generalNotes?: string | null;
  /** Lead Proposals: image attachments (or post-convert Pre-Sale Photos) for "Use General photos". */
  readonly generalPhotos?: readonly JarvisGeneralPhotoSeed[];
  /** Required with generalPhotos so the server action can load bytes for the Attach photos input. */
  readonly leadIdForGeneralPhotos?: string | null;
  /**
   * When Jarvis finishes drafting an estimate, navigate into the three-panel
   * workspace (`/leads/estimates/{id}`) instead of leaving staff on the launcher.
   */
  readonly navigateOnEstimateDraft?: boolean;
  /**
   * Lead id used to poll for a pending estimate workspace when the chat reply
   * omits the link (apology / notes paragraph). Falls back to leadIdForGeneralPhotos.
   */
  readonly leadIdForEstimateNav?: string | null;
  /**
   * Estimate ids already rendered on the page at load. Auto-nav only follows
   * *new* ids after a draft (so "compose another" isn't yanked to an old draft),
   * unless the page thought there were none (stuck START HERE recovery).
   */
  readonly knownEstimateIds?: readonly string[];
  /**
   * `docked` = estimate rail: no inner Jarvis chrome (outer rail already has Jarvis
   * header), denser empty state, compact composer. `default` = floating launcher /
   * full embeds.
   */
  readonly chrome?: "default" | "docked";
  /** Truncated address chip in Ask composer (Handoff location pin). */
  readonly locationChip?: string | null;
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

function base64ToFile(fileName: string, mimeType: string, base64: string): File {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new File([bytes], fileName, { type: mimeType });
}

function JarvisChatBody({
  context,
  storageKeyFull,
  suggestions,
  emptyStateHint,
  composerPlaceholder,
  onClose,
  onNewChat,
  heightClassName,
  onPendingChange,
  generalNotes,
  generalPhotos,
  leadIdForGeneralPhotos,
  navigateOnEstimateDraft = false,
  leadIdForEstimateNav = null,
  knownEstimateIds = [],
  chrome = "default",
  locationChip = null,
}: {
  context: Record<string, unknown> | null;
  storageKeyFull: string;
  suggestions: readonly string[];
  emptyStateHint: string;
  composerPlaceholder: string;
  onClose?: () => void;
  onNewChat: () => void;
  heightClassName: string;
  onPendingChange?: (pending: boolean) => void;
  generalNotes?: string | null;
  generalPhotos?: readonly JarvisGeneralPhotoSeed[];
  leadIdForGeneralPhotos?: string | null;
  navigateOnEstimateDraft?: boolean;
  leadIdForEstimateNav?: string | null;
  knownEstimateIds?: readonly string[];
  chrome?: "default" | "docked";
  locationChip?: string | null;
}) {
  const docked = chrome === "docked";
  const router = useRouter();
  const funUi = useFunUi();
  const navigatedEstimateHref = useRef<string | null>(null);
  const knownEstimateIdSet = useRef(new Set(knownEstimateIds));
  const watchedForNewEstimateRef = useRef(false);
  const leadIdForNav = leadIdForEstimateNav ?? leadIdForGeneralPhotos ?? null;
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
  const fileInputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  // Bumped on each send so an in-flight draft poll can't overwrite the new reply.
  const sendEpochRef = useRef(0);
  // Covers compressing photos in the browser, which happens before formAction (and
  // therefore useActionState's own `pending`) ever starts — see chat-input-form.tsx's
  // identical note.
  const [preparing, setPreparing] = useState(false);
  // Stays true from submit click through the whole server turn. useActionState's
  // `pending` alone can drop (or never flip) after async attachment prep +
  // startTransition — leaving only an older assistant bubble and looking idle.
  const [requestInFlight, setRequestInFlight] = useState(false);
  const [optimisticUserText, setOptimisticUserText] = useState<string | null>(null);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  const [hangError, setHangError] = useState<string | null>(null);
  const [seedStatus, setSeedStatus] = useState<string | null>(null);
  const [loadingGeneralPhotos, setLoadingGeneralPhotos] = useState(false);
  const [workspaceReadyHref, setWorkspaceReadyHref] = useState<string | null>(null);
  const [, startRefresh] = useTransition();
  // useActionState's dispatch must run inside a transition (or as a form action /
  // formAction prop). Calling it after async attachment prep used to happen outside
  // one — React then warned and `pending` stayed false, so the UI looked idle while
  // the server action was still running (or appeared stuck on long drafts).
  // Keep `sendPending` — the launcher used to discard it, which hid the working UI.
  const [sendPending, startSend] = useTransition();

  const trimmedGeneralNotes = generalNotes?.trim() ?? "";
  const generalPhotoCount = generalPhotos?.length ?? 0;
  const showGeneralSeedActions = generalNotes !== undefined || generalPhotos !== undefined;

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
  }, [viewState.messages, viewState.pendingActions, workspaceReadyHref]);

  const messages = viewState.messages ?? [];
  const pendingActions = viewState.pendingActions ?? [];
  const pendingCount = viewState.pendingCount ?? pendingActions.filter((action) => action.status === "PENDING").length;
  const conversationId = viewState.conversationId;
  const waitingOnDraft = isWaitingOnAsyncDraft(messages);
  const lastAssistant = [...messages].reverse().find((message) => message.role === "ASSISTANT");
  const draftFailed = Boolean(lastAssistant && isAsyncDraftFailureMessage(lastAssistant.content));
  // Combined busy flag: covers prep → transition → action → async draft poll.
  const turnInFlight = preparing || pending || sendPending || requestInFlight;
  const working = (turnInFlight || waitingOnDraft) && !draftFailed && !hangError;

  useEffect(() => {
    onPendingChange?.(working);
  }, [working, onPendingChange]);

  // Drop the local in-flight latch once React reports the action/transition done.
  // waitingOnDraft keeps `working` true after that so the indicator stays up.
  // setTimeout avoids react-hooks/set-state-in-effect (sync setState in effect body).
  useEffect(() => {
    if (!requestInFlight) return;
    if (preparing || pending || sendPending) return;
    const timer = window.setTimeout(() => {
      setRequestInFlight(false);
      setOptimisticUserText(null);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [requestInFlight, preparing, pending, sendPending, viewState.messages, viewState.error]);

  function goToEstimateWorkspace(href: string) {
    if (navigatedEstimateHref.current === href) return;
    navigatedEstimateHref.current = href;
    setWorkspaceReadyHref(href);
    setRequestInFlight(false);
    setOptimisticUserText(null);
    setHangError(null);
    // Refresh RSC so Lead Proposals doesn't keep a stale empty-estimates tree.
    router.refresh();
    router.push(href);
  }

  // Message-derived navigation: scan the whole thread (not just the last bubble).
  // An apology/notes paragraph after a successful draft used to block redirect.
  useEffect(() => {
    if (!navigateOnEstimateDraft || docked) return;
    const href = findEstimateWorkspaceHrefInMessages(messages);
    if (!href) return;
    const estimateId = href.split("/").pop() ?? "";
    const isKnown = knownEstimateIdSet.current.has(estimateId);
    // Same rule as the DB poll — only follow ids this page render didn't already list.
    if (knownEstimateIdSet.current.size > 0 && isKnown) return;
    goToEstimateWorkspace(href);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- navigate once per href; router is stable enough
  }, [navigateOnEstimateDraft, docked, messages]);

  // Conversation poll while the async worker is drafting.
  useEffect(() => {
    if (!conversationId || !waitingOnDraft || turnInFlight || draftFailed) return;
    const epochAtStart = sendEpochRef.current;
    const timer = window.setInterval(() => {
      startRefresh(async () => {
        const next = await refreshJarvisLauncherConversationAction(conversationId);
        if (sendEpochRef.current === epochAtStart) setOverlayState(next);
      });
    }, DRAFT_POLL_MS);
    return () => window.clearInterval(timer);
  }, [conversationId, waitingOnDraft, turnInFlight, draftFailed]);

  // DB poll: draft can finish (or already exist) while chat stays on an apology bubble.
  useEffect(() => {
    if (!navigateOnEstimateDraft || !leadIdForNav || docked) return;

    let cancelled = false;
    const poll = async () => {
      const pendingWorkspace = await findLeadPendingEstimateWorkspaceAction(leadIdForNav);
      if (cancelled || !pendingWorkspace) return;
      const isNew = !knownEstimateIdSet.current.has(pendingWorkspace.estimateId);
      // Stuck recovery: page rendered with zero estimates but DB already has one.
      // After a send: follow new ids only (don't yank "compose another" to an old draft).
      if (knownEstimateIdSet.current.size > 0 && !isNew) return;
      goToEstimateWorkspace(`/leads/estimates/${pendingWorkspace.estimateId}`);
    };

    // One-shot stuck recovery when RSC still thinks there are no estimates.
    if (knownEstimateIdSet.current.size === 0) {
      void poll();
    }

    if (!(working || watchedForNewEstimateRef.current)) {
      return () => {
        cancelled = true;
      };
    }

    void poll();
    const timer = window.setInterval(() => {
      void poll();
    }, DRAFT_POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigateOnEstimateDraft, leadIdForNav, docked, working]);

  // Hang / timeout: never leave a spinning or idle-stuck START HERE card forever.
  useEffect(() => {
    if (!turnInFlight) return;
    const timer = window.setTimeout(() => {
      setRequestInFlight(false);
      setOptimisticUserText(null);
      setHangError(
        navigateOnEstimateDraft
          ? "Jarvis is taking too long. Retry below — or open the estimate workspace if the draft already landed."
          : "Jarvis is taking too long. You can retry your message.",
      );
    }, TURN_TIMEOUT_MS);
    return () => window.clearTimeout(timer);
  }, [turnInFlight, navigateOnEstimateDraft]);

  useEffect(() => {
    if (!waitingOnDraft || turnInFlight || draftFailed) return;
    const timer = window.setTimeout(() => {
      setHangError(
        "Still no draft reply from Jarvis. Retry, or open the estimate workspace if it already exists in another tab.",
      );
    }, DRAFT_POLL_TIMEOUT_MS);
    return () => window.clearTimeout(timer);
  }, [waitingOnDraft, turnInFlight, draftFailed]);

  const workingMode: JarvisWorkingMode = preparing
    ? "preparing"
    : waitingOnDraft && !turnInFlight
      ? "draft_poll"
      : navigateOnEstimateDraft
        ? "estimate"
        : "general";

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

  function seedGeneralNotes() {
    setSeedStatus(null);
    setAttachmentError(null);
    if (!trimmedGeneralNotes) {
      setSeedStatus("No notes on the General tab yet. Add them there, then try again.");
      return;
    }
    const textarea = formRef.current?.elements.namedItem("text");
    if (!(textarea instanceof HTMLTextAreaElement)) return;
    textarea.value = trimmedGeneralNotes;
    textarea.focus();
    setSeedStatus("General notes loaded into Ask Jarvis.");
  }

  async function seedGeneralPhotos() {
    setSeedStatus(null);
    setAttachmentError(null);
    if (generalPhotoCount === 0 || !leadIdForGeneralPhotos) {
      setSeedStatus("No General photos yet. Upload images on the General tab, then try again.");
      return;
    }
    const input = fileInputRef.current;
    if (!input) return;

    setLoadingGeneralPhotos(true);
    try {
      const result = await loadLeadGeneralPhotosForJarvisAction(leadIdForGeneralPhotos);
      if (!result.ok) {
        setAttachmentError(result.error);
        return;
      }
      const transfer = new DataTransfer();
      for (const photo of result.photos) {
        transfer.items.add(base64ToFile(photo.fileName, photo.mimeType, photo.base64));
      }
      input.files = transfer.files;
      const count = transfer.files.length;
      const extra = result.truncated ? " (capped at Jarvis attachment limit)" : "";
      setSeedStatus(
        count === 1
          ? `Attached 1 General photo${extra}.`
          : `Attached ${count} General photos${extra}.`,
      );
    } finally {
      setLoadingGeneralPhotos(false);
    }
  }

  return (
    <div
      className={`flex ${heightClassName} w-full flex-col overflow-hidden bg-[var(--bt-panel-bg)] ${
        docked
          ? "border-0"
          : funUi
            ? "rounded-3xl border-2"
            : "rounded-lg border"
      }`}
      style={docked ? undefined : { borderColor: funUi ? "var(--bt-primary)" : "var(--bt-border)" }}
    >
      {!docked ? (
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
            {funUi ? <JarvisMascot expression={working ? "thinking" : "happy"} size={28} tone="light" /> : <span>✦</span>} Jarvis
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
      ) : (
        <div className="flex items-center justify-end gap-2 px-2 pt-0.5 text-[10px]">
          <button type="button" onClick={onNewChat} className="text-[var(--bt-muted)] hover:underline">
            New chat
          </button>
          {conversationId ? (
            <Link href={`/jarvis/${conversationId}`} className="text-[var(--bt-primary)] hover:underline">
              Full view
            </Link>
          ) : null}
        </div>
      )}

      <div ref={scrollRef} className={`flex flex-1 flex-col gap-1.5 overflow-y-auto ${docked ? "p-2" : "gap-2 p-3"}`}>
        {messages.length === 0 && pendingActions.length === 0 ? (
          <div className={`flex flex-1 flex-col justify-end ${docked ? "gap-1.5 pb-0.5" : "gap-2 pb-1"}`}>
            <p className={`text-center text-[var(--bt-muted)] ${docked ? "text-[10px] leading-snug" : "text-xs sm:text-sm"}`}>
              {emptyStateHint}
            </p>
            {suggestions.length > 0 ? (
              <div className={`flex flex-wrap ${docked ? "justify-start gap-1" : "justify-center gap-1.5"}`}>
                {(docked ? suggestions.slice(0, 3) : suggestions).map((suggestion) => (
                  <button
                    key={suggestion}
                    type="button"
                    onClick={() => fillSuggestion(suggestion)}
                    className={`max-w-full rounded-full border text-left leading-snug text-[var(--bt-text)] hover:bg-black/5 ${
                      docked
                        ? "truncate px-2 py-0.5 text-[10px]"
                        : "px-2.5 py-1.5 text-[11px] sm:text-xs"
                    }`}
                    style={{ borderColor: "var(--bt-border)" }}
                    title={suggestion}
                  >
                    {docked && suggestion.length > 36 ? `${suggestion.slice(0, 34)}…` : suggestion}
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
            {optimisticUserText && turnInFlight ? (
              <div className="flex justify-end">
                <div
                  className="max-w-[85%] whitespace-pre-wrap rounded-lg px-3 py-2 text-sm opacity-90"
                  style={{ background: "var(--bt-primary)", color: "var(--bt-on-primary)" }}
                >
                  {optimisticUserText}
                </div>
              </div>
            ) : null}
          </>
        )}
        {optimisticUserText && turnInFlight && messages.length === 0 && pendingActions.length === 0 ? (
          <div className="flex justify-end">
            <div
              className="max-w-[85%] whitespace-pre-wrap rounded-lg px-3 py-2 text-sm opacity-90"
              style={{ background: "var(--bt-primary)", color: "var(--bt-on-primary)" }}
            >
              {optimisticUserText}
            </div>
          </div>
        ) : null}
        {working ? <JarvisWorkingIndicator key={workingMode} mode={workingMode} funUi={funUi} compact={docked} /> : null}
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

      <JarvisAskComposer
        formRef={formRef}
        fileInputRef={fileInputRef}
        conversationId={conversationId}
        contextJson={context ? JSON.stringify(context) : ""}
        placeholder={composerPlaceholder}
        pending={working}
        preparing={preparing}
        funUi={funUi}
        rows={docked ? 2 : 2}
        compact={docked}
        locationChip={locationChip}
        onTranscript={appendVoiceTranscript}
        onSubmit={async (formData) => {
          setAttachmentError(null);
          setHangError(null);
          setWorkspaceReadyHref(null);
          sendEpochRef.current += 1;
          setOverlayState(null);
          if (navigateOnEstimateDraft) watchedForNewEstimateRef.current = true;
          const typed = String(formData.get("text") ?? "").trim();
          setOptimisticUserText(typed || null);
          setRequestInFlight(true);
          setPreparing(true);
          const prepared = await prepareJarvisAttachments(formData).finally(() => setPreparing(false));
          if (prepared.error) {
            setAttachmentError(prepared.error);
            setRequestInFlight(false);
            setOptimisticUserText(null);
            return;
          }
          startSend(() => {
            formAction(prepared.formData);
          });
          formRef.current?.reset();
        }}
        seedActions={
          showGeneralSeedActions ? (
            <div className="flex flex-col gap-1.5 sm:flex-row sm:flex-wrap sm:items-center">
              <button
                type="button"
                onClick={seedGeneralNotes}
                disabled={working}
                className="min-h-10 touch-manipulation rounded-full border px-3 py-2 text-left text-xs font-semibold text-[var(--bt-primary)] hover:bg-black/5 disabled:opacity-50 sm:min-h-0 sm:py-1.5"
                style={{ borderColor: "var(--bt-primary)" }}
              >
                Use General notes
              </button>
              <button
                type="button"
                onClick={() => void seedGeneralPhotos()}
                disabled={working || loadingGeneralPhotos}
                className="min-h-10 touch-manipulation rounded-full border px-3 py-2 text-left text-xs font-semibold text-[var(--bt-primary)] hover:bg-black/5 disabled:opacity-50 sm:min-h-0 sm:py-1.5"
                style={{ borderColor: "var(--bt-primary)" }}
              >
                {loadingGeneralPhotos ? "Loading photos…" : "Use General photos"}
              </button>
            </div>
          ) : null
        }
        footer={
          <>
            {seedStatus && !working ? <p className="px-0.5 text-xs text-[var(--bt-muted)]">{seedStatus}</p> : null}
            {working ? (
              <p className="px-0.5 text-xs font-medium" style={{ color: "var(--bt-primary)" }} aria-live="polite">
                {preparing
                  ? "Preparing photos…"
                  : waitingOnDraft && !turnInFlight
                    ? "Draft still running — hang tight…"
                    : navigateOnEstimateDraft
                      ? "Working on estimate…"
                      : "Jarvis is working…"}
              </p>
            ) : null}
            {workspaceReadyHref ? (
              <p className="px-0.5 text-xs font-medium" style={{ color: "var(--bt-primary)" }}>
                Estimate ready —{" "}
                <Link href={workspaceReadyHref} className="underline">
                  open workspace
                </Link>
              </p>
            ) : null}
            {hangError ? (
              <div className="flex flex-col gap-1.5 px-0.5">
                <p className="text-xs text-red-600" role="alert">
                  {hangError}
                </p>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="rounded-full border px-2.5 py-1 text-xs font-semibold text-[var(--bt-primary)] hover:bg-black/5"
                    style={{ borderColor: "var(--bt-primary)" }}
                    onClick={() => {
                      setHangError(null);
                      if (leadIdForNav) {
                        void findLeadPendingEstimateWorkspaceAction(leadIdForNav).then((pendingWorkspace) => {
                          if (pendingWorkspace) {
                            goToEstimateWorkspace(`/leads/estimates/${pendingWorkspace.estimateId}`);
                          } else {
                            setSeedStatus("No estimate on this lead yet — send another Ask Jarvis message to draft.");
                          }
                        });
                      }
                    }}
                  >
                    Check for estimate
                  </button>
                  <button
                    type="button"
                    className="rounded-full border px-2.5 py-1 text-xs font-medium text-[var(--bt-text)] hover:bg-black/5"
                    style={{ borderColor: "var(--bt-border)" }}
                    onClick={() => setHangError(null)}
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            ) : null}
            {attachmentError ?? viewState.error ? (
              <p className="px-0.5 text-xs text-red-600" role="alert">
                {attachmentError ?? viewState.error}
              </p>
            ) : null}
          </>
        }
      />
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
  composerPlaceholder = "Ask Jarvis",
  onClose,
  heightClassName = "h-[32rem]",
  onPendingChange,
  generalNotes,
  generalPhotos,
  leadIdForGeneralPhotos,
  navigateOnEstimateDraft = false,
  leadIdForEstimateNav = null,
  knownEstimateIds = [],
  chrome = "default",
  locationChip = null,
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
      composerPlaceholder={composerPlaceholder}
      onClose={onClose}
      onNewChat={startNewChat}
      heightClassName={heightClassName}
      generalNotes={generalNotes}
      generalPhotos={generalPhotos}
      leadIdForGeneralPhotos={leadIdForGeneralPhotos}
      navigateOnEstimateDraft={navigateOnEstimateDraft}
      leadIdForEstimateNav={leadIdForEstimateNav}
      knownEstimateIds={knownEstimateIds}
      chrome={chrome}
      locationChip={locationChip}
    />
  );
}
