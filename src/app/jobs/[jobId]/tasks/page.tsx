import Link from "next/link";
import { notFound } from "next/navigation";

import { SetupNotice } from "@/app/admin/setup-notice";
import { CreateModal } from "@/components/shell/CreateModal";
import { PageHeader } from "@/components/shell/PageHeader";
import { currentAppUser } from "@/lib/auth";
import { db } from "@/lib/db";

import { TodoForm } from "./todo-form";
import { TasksGrid } from "./tasks-grid";

export const dynamic = "force-dynamic";

const TABS = [
  { key: "mine", label: "My tasks" },
  { key: "all", label: "All tasks" },
  { key: "punch", label: "Punch list" },
] as const;
type TabKey = (typeof TABS)[number]["key"];

export default async function TasksPage({ params, searchParams }: PageProps<"/jobs/[jobId]/tasks">) {
  const { jobId } = await params;
  const { tab: tabParam, completed } = await searchParams;
  const tab: TabKey = TABS.some((t) => t.key === tabParam) ? (tabParam as TabKey) : "all";
  const showCompleted = completed === "1";

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

  const todos = await db.todo.findMany({
    where: {
      jobId: job.id,
      ...(tab === "mine" ? { assigneeUserId: user.id } : {}),
      ...(tab === "punch" ? { category: { equals: "punch", mode: "insensitive" as const } } : {}),
      ...(showCompleted ? {} : { status: { not: "DONE" as const } }),
    },
    orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }],
    include: { assigneeUser: { select: { email: true } } },
  });

  const rows = todos.map((todo) => ({
    id: todo.id,
    jobId: job.id,
    title: todo.title,
    category: todo.category,
    priority: todo.priority,
    status: todo.status,
    assignee: todo.assigneeUser?.email ?? null,
    dueDate: todo.dueDate ? todo.dueDate.toISOString() : null,
  }));

  const href = (nextTab: TabKey, nextCompleted: boolean) => `/jobs/${job.id}/tasks?tab=${nextTab}${nextCompleted ? "&completed=1" : ""}`;

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4 p-6">
      <PageHeader
        jobName={job.name}
        title="Tasks"
        action={
          <div className="flex items-center gap-2">
            <CreateModal triggerLabel="+ Task" title="New task">
              <TodoForm jobId={job.id} />
            </CreateModal>
          </div>
        }
      />

      <div className="flex items-end justify-between gap-3 border-b" style={{ borderColor: "var(--bt-border)" }}>
        <nav className="flex gap-1">
          {TABS.map((t) => (
            <Link
              key={t.key}
              href={href(t.key, showCompleted)}
              className="-mb-px border-b-2 px-3 py-2 text-sm font-medium transition"
              style={{ borderColor: t.key === tab ? "var(--bt-primary)" : "transparent", color: t.key === tab ? "var(--bt-primary)" : "var(--bt-muted)" }}
            >
              {t.label}
            </Link>
          ))}
        </nav>
        <Link href={href(tab, !showCompleted)} className="pb-2 text-xs font-medium text-[var(--bt-primary)] hover:underline">
          {showCompleted ? "Hide completed" : "Show completed"}
        </Link>
      </div>

      <TasksGrid rows={rows} emptyMessage={tab === "punch" ? "No punch list items. Tag a task \"punch\" to add it here." : "No tasks to show."} />
    </div>
  );
}
