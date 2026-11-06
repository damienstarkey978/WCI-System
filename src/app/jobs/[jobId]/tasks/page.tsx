import Link from "next/link";
import { notFound } from "next/navigation";

import { SetupNotice } from "@/app/admin/setup-notice";
import { CreateModal } from "@/components/shell/CreateModal";
import { EmptyState } from "@/components/shell/EmptyState";
import { FunnelIcon, SortArrowsIcon, TaskIcon } from "@/components/shell/icons";
import { PageHeader } from "@/components/shell/PageHeader";
import { currentAppUser } from "@/lib/auth";
import { db } from "@/lib/db";

import { QuickAddTask } from "./quick-add-task";
import { TasksGrid } from "./tasks-grid";
import { TasksToolbar } from "./tasks-toolbar";
import { TodoForm } from "./todo-form";

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
  const tab: TabKey = TABS.some((t) => t.key === tabParam) ? (tabParam as TabKey) : "mine";
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

  const staff = await db.user.findMany({
    where: { organizationId: user.organizationId, isActive: true, role: { not: "AGENT" } },
    select: { id: true, name: true, email: true },
    orderBy: { name: "asc" },
  });
  const staffOptions = staff.map((person) => ({ id: person.id, name: person.name?.trim() || person.email }));

  const baseWhere = {
    jobId: job.id,
    ...(showCompleted ? {} : { status: { not: "DONE" as const } }),
  };

  const [mineCount, allCount, punchCount, todos] = await Promise.all([
    db.todo.count({ where: { ...baseWhere, assigneeUserId: user.id } }),
    db.todo.count({ where: baseWhere }),
    db.todo.count({ where: { ...baseWhere, category: { contains: "punch", mode: "insensitive" as const } } }),
    db.todo.findMany({
      where: {
        ...baseWhere,
        ...(tab === "mine" ? { assigneeUserId: user.id } : {}),
        ...(tab === "punch" ? { category: { contains: "punch", mode: "insensitive" as const } } : {}),
      },
      orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }],
      include: {
        assigneeUser: { select: { id: true, email: true, name: true } },
        checklistItems: { orderBy: { sortOrder: "asc" } },
      },
    }),
  ]);

  const counts: Record<TabKey, number> = { mine: mineCount, all: allCount, punch: punchCount };

  const rows = todos.map((todo) => ({
    id: todo.id,
    jobId: job.id,
    title: todo.title,
    category: todo.category,
    priority: todo.priority,
    status: todo.status,
    assignee: todo.assigneeUser?.name?.trim() || todo.assigneeUser?.email || null,
    dueDate: todo.dueDate ? todo.dueDate.toISOString() : null,
    detail: {
      id: todo.id,
      title: todo.title,
      description: todo.description ?? "",
      priority: todo.priority,
      status: todo.status,
      category: todo.category,
      dueDate: todo.dueDate ? todo.dueDate.toISOString().slice(0, 10) : null,
      assigneeUserId: todo.assigneeUserId,
      createdAt: todo.createdAt.toISOString(),
      checklist: todo.checklistItems.map((item) => ({ id: item.id, title: item.title, isDone: item.isDone })),
    },
  }));

  const href = (nextTab: TabKey, nextCompleted: boolean) =>
    `/jobs/${job.id}/tasks?tab=${nextTab}${nextCompleted ? "&completed=1" : ""}`;

  const emptyTitle =
    tab === "punch" ? "No punch list items" : tab === "mine" ? "No tasks assigned to you" : "No tasks";
  const emptyDescription =
    tab === "punch"
      ? "Tag a task type as punch to add it here, or create a new punch-list task."
      : tab === "mine"
        ? "Tasks assigned to you will show up here. Incomplete only unless you show completed."
        : "Create a task to track work on this job.";

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 p-4 sm:p-6">
      <PageHeader jobName={job.name} title="Tasks" action={<TasksToolbar jobId={job.id} staff={staffOptions} />} />

      <div className="flex items-end justify-between gap-3 border-b" style={{ borderColor: "var(--bt-border)" }}>
        <nav className="flex gap-1">
          {TABS.map((t) => (
            <Link
              key={t.key}
              href={href(t.key, showCompleted)}
              className="-mb-px border-b-2 px-3 py-2 text-sm font-medium transition"
              style={{
                borderColor: t.key === tab ? "var(--bt-primary)" : "transparent",
                color: t.key === tab ? "var(--bt-primary)" : "var(--bt-muted)",
              }}
            >
              {t.label} ({counts[t.key]})
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-1 pb-2">
          <span
            className="inline-flex h-8 w-8 items-center justify-center rounded text-[var(--bt-muted)]"
            title="View settings"
            aria-hidden
          >
            <SortArrowsIcon className="h-4 w-4" />
          </span>
          <details className="relative">
            <summary
              className="inline-flex h-8 w-8 cursor-pointer list-none items-center justify-center rounded text-[var(--bt-primary)] hover:bg-black/5 [&::-webkit-details-marker]:hidden"
              title="Filter"
              aria-label="Filter tasks"
            >
              <FunnelIcon className="h-4 w-4" />
              {!showCompleted || tab === "mine" || tab === "punch" ? (
                <span className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full" style={{ background: "var(--bt-primary)" }} />
              ) : null}
            </summary>
            <div
              className="absolute right-0 z-20 mt-1 w-64 rounded-lg border bg-[var(--bt-panel-bg)] p-3 shadow-lg"
              style={{ borderColor: "var(--bt-border)" }}
            >
              <p className="mb-2 text-xs font-semibold text-[var(--bt-muted)]">Filters</p>
              <ul className="mb-3 space-y-1.5 text-sm text-[var(--bt-text)]">
                {tab === "mine" ? <li>Assignee is me</li> : null}
                {tab === "punch" ? <li>Type includes Punch list</li> : null}
                <li>{showCompleted ? "Status includes All" : "Status includes Not completed"}</li>
              </ul>
              <div className="flex items-center justify-between gap-2">
                <Link href={href(tab, false)} className="text-xs font-medium text-[var(--bt-muted)] hover:underline">
                  Clear all
                </Link>
                <Link href={href(tab, !showCompleted)} className="text-xs font-medium text-[var(--bt-primary)] hover:underline">
                  {showCompleted ? "Hide completed" : "Show completed"}
                </Link>
              </div>
            </div>
          </details>
        </div>
      </div>

      {/* BT filter chips — mirror the active tab / completed state */}
      <div className="flex flex-wrap items-center gap-2">
        {tab === "mine" ? (
          <span
            className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium text-[var(--bt-primary)]"
            style={{ borderColor: "color-mix(in srgb, var(--bt-primary) 35%, var(--bt-border))", background: "color-mix(in srgb, var(--bt-primary) 8%, white)" }}
          >
            Assignee is me
          </span>
        ) : null}
        {tab === "mine" && !showCompleted ? <span className="text-[11px] font-medium text-[var(--bt-muted)]">AND</span> : null}
        {tab === "punch" ? (
          <span
            className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium text-[var(--bt-primary)]"
            style={{ borderColor: "color-mix(in srgb, var(--bt-primary) 35%, var(--bt-border))", background: "color-mix(in srgb, var(--bt-primary) 8%, white)" }}
          >
            Type includes Punch list
          </span>
        ) : null}
        {tab === "punch" && !showCompleted ? <span className="text-[11px] font-medium text-[var(--bt-muted)]">AND</span> : null}
        {!showCompleted ? (
          <Link
            href={href(tab, true)}
            className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium text-[var(--bt-text)] hover:bg-black/5"
            style={{ borderColor: "var(--bt-border)" }}
            title="Show completed"
          >
            Status includes <span className="font-semibold">Not completed</span>
            <span aria-hidden className="text-[var(--bt-muted)]">
              ×
            </span>
          </Link>
        ) : null}
        <span
          className="inline-flex items-center gap-1 rounded border px-2 py-1 text-xs font-medium text-[var(--bt-muted)]"
          style={{ borderColor: "var(--bt-border)" }}
          title="Additional filters coming soon"
        >
          + Filter
        </span>
        {!showCompleted ? (
          <Link href={href(tab, true)} className="text-xs font-medium text-[var(--bt-primary)] hover:underline">
            Clear all
          </Link>
        ) : null}
      </div>

      {rows.length === 0 ? (
        <>
          <EmptyState
            icon={<TaskIcon className="h-10 w-10" />}
            title={emptyTitle}
            description={emptyDescription}
            action={
              <CreateModal triggerLabel="+ Task" title="New task">
                <TodoForm jobId={job.id} staff={staffOptions} />
              </CreateModal>
            }
          />
          <QuickAddTask jobId={job.id} />
        </>
      ) : (
        <>
          <TasksGrid rows={rows} jobId={job.id} jobName={job.name} staff={staffOptions} />
          <div className="rounded-lg border px-3 py-1" style={{ borderColor: "var(--bt-border)", background: "var(--bt-panel-bg)" }}>
            <QuickAddTask jobId={job.id} />
          </div>
        </>
      )}
    </div>
  );
}
