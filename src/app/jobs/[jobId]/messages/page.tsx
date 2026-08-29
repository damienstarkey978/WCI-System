import { notFound } from "next/navigation";

import { SetupNotice } from "@/app/admin/setup-notice";
import { EmptyState } from "@/components/shell/EmptyState";
import { currentAppUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatDate } from "@/lib/format";

import { JOB_MESSAGE_FEATURE_TYPE } from "./constants";
import { MessageForm } from "./message-form";

export const dynamic = "force-dynamic";

export default async function MessagesPage({ params }: PageProps<"/jobs/[jobId]/messages">) {
  const { jobId } = await params;

  let user;
  try {
    user = await currentAppUser();
  } catch (error) {
    return <SetupNotice detail={error instanceof Error ? error.message : String(error)} />;
  }
  if (!user) {
    return <SetupNotice detail="No organization found. Seed the database, then reload." />;
  }

  const job = await db.job.findFirst({ where: { id: jobId, organizationId: user.organizationId } });
  if (!job) notFound();

  const messages = await db.comment.findMany({
    where: { organizationId: user.organizationId, featureType: JOB_MESSAGE_FEATURE_TYPE, featureId: job.id },
    orderBy: { createdAt: "asc" },
    include: { authorUser: true },
  });

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4 p-6">
      <h1 className="text-xl font-semibold text-[var(--bt-text)]">Messaging — {job.name}</h1>

      <div className="flex flex-col rounded-lg border bg-[var(--bt-panel-bg)]" style={{ borderColor: "var(--bt-border)" }}>
        <div className="flex flex-col gap-3 p-4">
          {messages.length === 0 ? (
            <EmptyState title="No messages yet" description="Messages posted about this job will appear here." />
          ) : (
            messages.map((message) => (
              <div key={message.id} className="rounded border px-3 py-2" style={{ borderColor: "var(--bt-border)" }}>
                <div className="flex items-center justify-between text-xs text-[var(--bt-muted)]">
                  <span className="font-medium text-[var(--bt-text)]">{message.authorUser?.email ?? "Unknown"}</span>
                  <span>{formatDate(message.createdAt)}</span>
                </div>
                <p className="mt-1 whitespace-pre-wrap text-sm text-[var(--bt-text)]">{message.body}</p>
              </div>
            ))
          )}
        </div>
        <MessageForm jobId={job.id} />
      </div>
    </div>
  );
}
