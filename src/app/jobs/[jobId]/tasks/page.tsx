import { notFound } from "next/navigation";

import { SetupNotice } from "@/app/admin/setup-notice";
import { currentAppUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatDate } from "@/lib/format";

import { setTodoStatusAction } from "./actions";
import { TodoForm } from "./todo-form";

export const dynamic = "force-dynamic";

const PRIORITY_STYLE: Record<string, { bg: string; text: string }> = {
  HIGH: { bg: "color-mix(in srgb, var(--bt-danger) 14%, transparent)", text: "var(--bt-danger)" },
  MEDIUM: { bg: "color-mix(in srgb, var(--bt-hazard) 14%, transparent)", text: "var(--bt-hazard)" },
  LOW: { bg: "#e5e7eb", text: "#374151" },
};

export default async function TasksPage({ params }: PageProps<"/jobs/[jobId]/tasks">) {
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

  const todos = await db.todo.findMany({
    where: { jobId: job.id },
    orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }],
  });

  const open = todos.filter((todo) => todo.status !== "DONE");
  const done = todos.filter((todo) => todo.status === "DONE");

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4 p-6">
      <h1 className="text-xl font-semibold text-[var(--bt-text)]">To-dos — {job.name}</h1>

      <TodoForm jobId={job.id} />

      <section className="rounded-lg border bg-[var(--bt-panel-bg)]" style={{ borderColor: "var(--bt-border)" }}>
        <header className="border-b px-4 py-3" style={{ borderColor: "var(--bt-border)" }}>
          <h2 className="text-sm font-semibold text-[var(--bt-text)]">Open ({open.length})</h2>
        </header>
        <div className="divide-y" style={{ borderColor: "var(--bt-border)" }}>
          {open.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-[var(--bt-muted)]">Nothing open.</p>
          ) : (
            open.map((todo) => {
              const style = PRIORITY_STYLE[todo.priority] ?? PRIORITY_STYLE.MEDIUM;
              return (
                <div key={todo.id} className="flex items-center gap-3 px-4 py-3">
                  <form action={setTodoStatusAction}>
                    <input type="hidden" name="jobId" value={job.id} />
                    <input type="hidden" name="todoId" value={todo.id} />
                    <input type="hidden" name="status" value="DONE" />
                    <button
                      type="submit"
                      aria-label="Mark done"
                      className="h-4 w-4 shrink-0 rounded border-2"
                      style={{ borderColor: "var(--bt-muted)" }}
                    />
                  </form>
                  <div className="flex-1">
                    <div className="text-sm text-[var(--bt-text)]">{todo.title}</div>
                    {todo.category ? <div className="text-xs text-[var(--bt-muted)]">{todo.category}</div> : null}
                  </div>
                  <span className="rounded px-1.5 py-0.5 text-[10px] font-semibold" style={{ background: style.bg, color: style.text }}>
                    {todo.priority}
                  </span>
                  <span className="w-20 shrink-0 text-right text-xs text-[var(--bt-muted)]">{formatDate(todo.dueDate)}</span>
                </div>
              );
            })
          )}
        </div>
      </section>

      {done.length > 0 ? (
        <section className="rounded-lg border bg-[var(--bt-panel-bg)]" style={{ borderColor: "var(--bt-border)" }}>
          <header className="border-b px-4 py-3" style={{ borderColor: "var(--bt-border)" }}>
            <h2 className="text-sm font-semibold text-[var(--bt-text)]">Done ({done.length})</h2>
          </header>
          <div className="divide-y" style={{ borderColor: "var(--bt-border)" }}>
            {done.map((todo) => (
              <div key={todo.id} className="flex items-center gap-3 px-4 py-3">
                <form action={setTodoStatusAction}>
                  <input type="hidden" name="jobId" value={job.id} />
                  <input type="hidden" name="todoId" value={todo.id} />
                  <input type="hidden" name="status" value="OPEN" />
                  <button
                    type="submit"
                    aria-label="Reopen"
                    className="flex h-4 w-4 shrink-0 items-center justify-center rounded text-[var(--bt-on-primary)]"
                    style={{ background: "var(--bt-primary)" }}
                  >
                    ✓
                  </button>
                </form>
                <div className="flex-1 text-sm text-[var(--bt-muted)] line-through">{todo.title}</div>
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
