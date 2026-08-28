import { db } from "@/lib/db";
import { formatDate } from "@/lib/format";

import { CommentForm } from "./CommentForm";

/**
 * Drop-in threaded comments for any detail page, backed by the shared
 * (featureType, featureId) Comment table (CLAUDE.md 2.3). Wiring a new module
 * onto comments is just rendering this with that module's own identifiers —
 * no new table, service, or Server Action needed.
 */
export async function CommentThread({
  organizationId,
  featureType,
  featureId,
  revalidate,
  title = "Comments",
}: {
  organizationId: string;
  featureType: string;
  featureId: string;
  revalidate: string;
  title?: string;
}) {
  const comments = await db.comment.findMany({
    where: { organizationId, featureType, featureId },
    orderBy: { createdAt: "asc" },
    include: { authorUser: true },
  });

  return (
    <section className="rounded-lg border bg-white" style={{ borderColor: "var(--bt-border)" }}>
      <h2 className="px-4 pt-4 text-sm font-semibold text-[var(--bt-text)]">{title}</h2>
      <div className="flex flex-col gap-2 p-4">
        {comments.length === 0 ? (
          <p className="text-sm text-[var(--bt-muted)]">No comments yet.</p>
        ) : (
          comments.map((comment) => (
            <div key={comment.id} className="rounded border px-3 py-2" style={{ borderColor: "var(--bt-border)" }}>
              <div className="flex items-center justify-between text-xs text-[var(--bt-muted)]">
                <span className="font-medium text-[var(--bt-text)]">{comment.authorUser?.email ?? "Unknown"}</span>
                <span>{formatDate(comment.createdAt)}</span>
              </div>
              <p className="mt-1 whitespace-pre-wrap text-sm text-[var(--bt-text)]">{comment.body}</p>
            </div>
          ))
        )}
      </div>
      <CommentForm featureType={featureType} featureId={featureId} revalidate={revalidate} />
    </section>
  );
}
