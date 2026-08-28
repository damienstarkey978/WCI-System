import { notFound } from "next/navigation";

import { SetupNotice } from "@/app/admin/setup-notice";
import { EmptyState } from "@/components/shell/EmptyState";
import { currentAppUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatDate, formatMoney } from "@/lib/format";

import { approveSelectionOptionAction } from "./actions";
import { CreateAllowanceForm } from "./create-allowance-form";
import { CreateSelectionForm } from "./create-selection-form";

export const dynamic = "force-dynamic";

const STATUS_STYLE: Record<string, { bg: string; text: string }> = {
  PENDING: { bg: "#e5e7eb", text: "#374151" },
  APPROVED: { bg: "var(--bt-status-open-bg)", text: "var(--bt-status-open-text)" },
  DECLINED: { bg: "#fee2e2", text: "#991b1b" },
};

export default async function SelectionsPage({ params }: PageProps<"/jobs/[jobId]/selections">) {
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

  const [selections, allowances, costCodes] = await Promise.all([
    db.selection.findMany({
      where: { jobId: job.id },
      orderBy: { dueDate: "asc" },
      include: { options: { orderBy: { sortOrder: "asc" } } },
    }),
    db.allowance.findMany({ where: { jobId: job.id }, orderBy: { title: "asc" }, select: { id: true, title: true } }),
    db.costCode.findMany({
      where: { organizationId: user.organizationId, isActive: true },
      orderBy: { sortOrder: "asc" },
      select: { id: true, code: true, name: true },
    }),
  ]);

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4 p-6">
      <h1 className="text-xl font-semibold text-[var(--bt-text)]">Selections — {job.name}</h1>

      <CreateAllowanceForm jobId={job.id} costCodes={costCodes} />
      <CreateSelectionForm jobId={job.id} allowances={allowances} />

      {selections.length === 0 ? (
        <EmptyState title="No selections yet" description="Selections created for this job will appear here for the client to choose from." />
      ) : (
        <div className="flex flex-col gap-4">
          {selections.map((selection) => {
            const decided = selection.options.some((option) => option.status !== "PENDING");
            return (
              <section key={selection.id} className="rounded-lg border bg-white" style={{ borderColor: "var(--bt-border)" }}>
                <header className="flex items-center justify-between border-b px-4 py-3" style={{ borderColor: "var(--bt-border)" }}>
                  <div>
                    <h2 className="text-sm font-semibold text-[var(--bt-text)]">{selection.title}</h2>
                    {selection.description ? <p className="text-xs text-[var(--bt-muted)]">{selection.description}</p> : null}
                  </div>
                  {selection.dueDate ? <span className="text-xs text-[var(--bt-muted)]">Due {formatDate(selection.dueDate)}</span> : null}
                </header>
                <div className="divide-y" style={{ borderColor: "var(--bt-border)" }}>
                  {selection.options.map((option) => {
                    const style = STATUS_STYLE[option.status] ?? STATUS_STYLE.PENDING;
                    return (
                      <div key={option.id} className="flex items-center justify-between px-4 py-3">
                        <div>
                          <div className="text-sm text-[var(--bt-text)]">{option.title}</div>
                          {option.description ? <div className="text-xs text-[var(--bt-muted)]">{option.description}</div> : null}
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-sm text-[var(--bt-text)]">{formatMoney(option.clientPriceCents)}</span>
                          <span className="rounded px-1.5 py-0.5 text-[10px] font-semibold" style={{ background: style.bg, color: style.text }}>
                            {option.status}
                          </span>
                          {!decided ? (
                            <form action={approveSelectionOptionAction}>
                              <input type="hidden" name="jobId" value={job.id} />
                              <input type="hidden" name="selectionId" value={selection.id} />
                              <input type="hidden" name="optionId" value={option.id} />
                              <button type="submit" className="text-xs font-medium text-[var(--bt-primary)] hover:underline">
                                Approve
                              </button>
                            </form>
                          ) : null}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
