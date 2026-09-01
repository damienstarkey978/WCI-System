import Link from "next/link";

import { formatDate } from "@/lib/format";
import { listConversations } from "@/lib/jarvis/service";

/**
 * The persistent desktop conversation-history column — hidden below `md` (same
 * convention as JobSidebar/MobileMenuDrawer) since a fixed 256px side column has no
 * reasonable place on a phone screen when the chat itself needs the full width. The
 * phone-width equivalent is mobile-conversation-history.tsx, rendered separately
 * inside the chat column itself (not here) so it lays out as a header bar above the
 * messages rather than a second column squeezed into this row.
 */
export async function ConversationSidebar({
  organizationId,
  userId,
  activeConversationId,
}: {
  organizationId: string;
  userId: string;
  activeConversationId?: string;
}) {
  const conversations = await listConversations(organizationId, userId);

  return (
    <div
      className="hidden min-h-0 w-64 shrink-0 flex-col gap-1 overflow-hidden border-r bg-[var(--bt-panel-bg)] p-3 md:flex"
      style={{ borderColor: "var(--bt-border)" }}
    >
      <Link
        href="/jarvis"
        className="rounded px-3 py-2 text-sm font-semibold text-[var(--bt-on-primary)]"
        style={{ background: "var(--bt-primary)" }}
      >
        + New chat
      </Link>
      <div className="mt-2 flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto">
        {conversations.length === 0 ? (
          <p className="px-2 py-4 text-xs text-[var(--bt-muted)]">No conversations yet.</p>
        ) : (
          conversations.map((conversation) => (
            <Link
              key={conversation.id}
              href={`/jarvis/${conversation.id}`}
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
  );
}
