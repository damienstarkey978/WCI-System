import Link from "next/link";
import { notFound } from "next/navigation";

import { SetupNotice } from "@/app/admin/setup-notice";
import { CreateModal } from "@/components/shell/CreateModal";
import { EmptyState } from "@/components/shell/EmptyState";
import { ChatIcon } from "@/components/shell/icons";
import { PageHeader } from "@/components/shell/PageHeader";
import { currentAppUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatDate } from "@/lib/format";
import { GENERAL_THREAD_ID, listThreadMessages, listThreadSummaries, MessageThreadNotFoundError } from "@/lib/messages/threads";

import { MessageForm } from "./message-form";
import { NewThreadForm } from "./new-thread-form";

export const dynamic = "force-dynamic";

export default async function MessagesPage({ params, searchParams }: PageProps<"/jobs/[jobId]/messages">) {
  const { jobId } = await params;
  const { thread: threadParam } = await searchParams;

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

  const threads = await listThreadSummaries(user.organizationId, job.id);
  const requested = typeof threadParam === "string" ? threadParam : null;
  const selected = threads.find((t) => t.id === requested) ?? threads[0] ?? null;

  let messages: Awaited<ReturnType<typeof listThreadMessages>> = [];
  if (selected) {
    try {
      messages = await listThreadMessages(user.organizationId, job.id, selected.id);
    } catch (error) {
      if (!(error instanceof MessageThreadNotFoundError)) throw error;
    }
  }

  const createAction = (
    <CreateModal triggerLabel="+ New Message" title="New message">
      <NewThreadForm jobId={job.id} />
    </CreateModal>
  );

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-3 p-4 sm:gap-4 sm:p-6">
      <PageHeader jobName={job.name} title="Messages" action={createAction} />

      {threads.length === 0 ? (
        <EmptyState
          icon={<ChatIcon className="h-10 w-10" />}
          title="No messages yet"
          description="Start a conversation about this job with + New Message."
          action={createAction}
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-[16rem_minmax(0,1fr)_14rem]">
          <nav className="overflow-hidden rounded-lg border bg-[var(--bt-panel-bg)]" style={{ borderColor: "var(--bt-border)" }}>
            <div className="flex gap-1 border-b px-2 pt-2" style={{ borderColor: "var(--bt-border)" }}>
              {["All", "Unread", "Archived"].map((tab, index) => (
                <span
                  key={tab}
                  className="-mb-px border-b-2 px-2 py-1.5 text-xs font-medium"
                  style={{
                    borderColor: index === 0 ? "var(--bt-primary)" : "transparent",
                    color: index === 0 ? "var(--bt-primary)" : "var(--bt-muted)",
                  }}
                >
                  {tab}
                </span>
              ))}
            </div>
            {threads.map((thread) => {
              const active = thread.id === selected?.id;
              return (
                <Link
                  key={thread.id}
                  href={`/jobs/${job.id}/messages?thread=${thread.id}`}
                  className="flex gap-2.5 border-b px-3 py-3 last:border-0"
                  style={{ borderColor: "var(--bt-border)", background: active ? "var(--bt-panel-bg-muted)" : undefined }}
                >
                  <span
                    className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
                    style={{ background: "color-mix(in srgb, var(--bt-primary) 14%, transparent)", color: "var(--bt-primary)" }}
                    aria-hidden
                  >
                    <ChatIcon className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-semibold text-[var(--bt-text)]">{thread.subject}</span>
                      <span className="shrink-0 text-xs text-[var(--bt-muted)]">{thread.messageCount}</span>
                    </div>
                    <div className="truncate text-xs text-[var(--bt-muted)]">{thread.preview}</div>
                    <div className="mt-0.5 text-[10px] text-[var(--bt-muted)]">{formatDate(thread.lastMessageAt)}</div>
                  </div>
                </Link>
              );
            })}
          </nav>

          <section className="flex min-h-[24rem] flex-col rounded-lg border bg-[var(--bt-panel-bg)]" style={{ borderColor: "var(--bt-border)" }}>
            <header className="border-b px-4 py-3" style={{ borderColor: "var(--bt-border)" }}>
              <h2 className="text-sm font-semibold text-[var(--bt-text)]">{selected?.subject ?? "Conversation"}</h2>
            </header>
            <div className="flex flex-1 flex-col gap-3 p-4">
              {messages.length === 0 ? <p className="text-sm text-[var(--bt-muted)]">No messages in this conversation.</p> : null}
              {messages.map((message) => (
                <div key={message.id} className="rounded border px-3 py-2" style={{ borderColor: "var(--bt-border)" }}>
                  <div className="flex items-center justify-between text-xs text-[var(--bt-muted)]">
                    <span className="font-medium text-[var(--bt-text)]">{message.authorUser?.name ?? message.authorUser?.email ?? "Unknown"}</span>
                    <span>{formatDate(message.createdAt)}</span>
                  </div>
                  <p className="mt-1 whitespace-pre-wrap text-sm text-[var(--bt-text)]">{message.body}</p>
                </div>
              ))}
            </div>
            {selected ? <MessageForm jobId={job.id} threadId={selected.id ?? GENERAL_THREAD_ID} /> : null}
          </section>

          <aside className="rounded-lg border bg-[var(--bt-panel-bg)] p-4 text-sm" style={{ borderColor: "var(--bt-border)" }}>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--bt-muted)]">Details</h3>
            <dl className="mt-3 flex flex-col gap-2 text-sm">
              <div>
                <dt className="text-[var(--bt-muted)]">Job</dt>
                <dd className="font-medium text-[var(--bt-text)]">{job.name}</dd>
              </div>
              <div>
                <dt className="text-[var(--bt-muted)]">Thread</dt>
                <dd className="font-medium text-[var(--bt-text)]">{selected?.subject ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-[var(--bt-muted)]">Messages</dt>
                <dd className="font-medium text-[var(--bt-text)]">{selected?.messageCount ?? 0}</dd>
              </div>
            </dl>
          </aside>
        </div>
      )}
    </div>
  );
}
