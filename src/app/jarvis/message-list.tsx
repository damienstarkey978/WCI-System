import { confirmPendingActionAction, declinePendingActionAction } from "./actions";

export interface JarvisMessageData {
  readonly id: string;
  readonly role: "USER" | "ASSISTANT";
  readonly content: string;
  readonly createdAt: Date;
}

export interface JarvisPendingActionData {
  readonly id: string;
  readonly summary: string;
  readonly status: "PENDING" | "CONFIRMED" | "DECLINED";
  readonly resultSummary: string | null;
  readonly createdAt: Date;
}

type TimelineEntry =
  | { readonly kind: "message"; readonly at: Date; readonly message: JarvisMessageData }
  | { readonly kind: "action"; readonly at: Date; readonly action: JarvisPendingActionData };

function PendingActionCard({ conversationId, action }: { conversationId: string; action: JarvisPendingActionData }) {
  if (action.status === "PENDING") {
    return (
      <div className="flex justify-start">
        <div className="max-w-[70%] rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-950">
          <div className="text-xs font-semibold uppercase tracking-wide text-amber-700">Waiting on your confirmation</div>
          <p className="mt-1">{action.summary}</p>
          <div className="mt-2 flex gap-2">
            <form action={confirmPendingActionAction}>
              <input type="hidden" name="conversationId" value={conversationId} />
              <input type="hidden" name="actionId" value={action.id} />
              <button type="submit" className="rounded bg-amber-600 px-3 py-1 text-xs font-semibold text-white hover:bg-amber-700">
                Confirm
              </button>
            </form>
            <form action={declinePendingActionAction}>
              <input type="hidden" name="conversationId" value={conversationId} />
              <input type="hidden" name="actionId" value={action.id} />
              <button type="submit" className="rounded border border-amber-400 px-3 py-1 text-xs font-medium text-amber-900 hover:bg-amber-100">
                Decline
              </button>
            </form>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex justify-start">
      <div
        className="max-w-[70%] rounded-lg border px-3 py-2 text-sm"
        style={
          action.status === "CONFIRMED"
            ? { borderColor: "#bbf7d0", background: "#f0fdf4", color: "#14532d" }
            : { borderColor: "var(--bt-border)", background: "#f3f4f6", color: "var(--bt-muted)" }
        }
      >
        <div className="text-xs font-semibold uppercase tracking-wide">{action.status === "CONFIRMED" ? "Confirmed" : "Declined"}</div>
        <p className="mt-1">{action.resultSummary ?? action.summary}</p>
      </div>
    </div>
  );
}

export function MessageList({
  conversationId,
  messages,
  pendingActions,
}: {
  conversationId: string;
  messages: readonly JarvisMessageData[];
  pendingActions: readonly JarvisPendingActionData[];
}) {
  if (messages.length === 0 && pendingActions.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center p-6 text-center text-sm text-[var(--bt-muted)]">
        Ask Jarvis to look up a job, draft a change order, log a note, or queue an invoice or proposal to send — it
        can&apos;t send anything client-facing without your confirmation first.
      </div>
    );
  }

  const timeline: TimelineEntry[] = [
    ...messages.map((message): TimelineEntry => ({ kind: "message", at: message.createdAt, message })),
    ...pendingActions.map((action): TimelineEntry => ({ kind: "action", at: action.createdAt, action })),
  ].sort((a, b) => a.at.getTime() - b.at.getTime());

  return (
    <div className="flex flex-1 flex-col gap-3 overflow-y-auto p-4">
      {timeline.map((entry) =>
        entry.kind === "message" ? (
          <div key={entry.message.id} className={`flex ${entry.message.role === "USER" ? "justify-end" : "justify-start"}`}>
            <div
              className="max-w-[70%] whitespace-pre-wrap rounded-lg px-3 py-2 text-sm"
              style={
                entry.message.role === "USER"
                  ? { background: "var(--bt-primary)", color: "white" }
                  : { background: "#f3f4f6", color: "var(--bt-text)" }
              }
            >
              {entry.message.content}
            </div>
          </div>
        ) : (
          <PendingActionCard key={entry.action.id} conversationId={conversationId} action={entry.action} />
        ),
      )}
    </div>
  );
}
