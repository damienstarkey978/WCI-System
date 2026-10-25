import Link from "next/link";
import { notFound } from "next/navigation";

import { SetupNotice } from "@/app/admin/setup-notice";
import { CreateModal } from "@/components/shell/CreateModal";
import { PageHeader } from "@/components/shell/PageHeader";
import { EmptyState } from "@/components/shell/EmptyState";
import { currentAppUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatDate, formatMoney } from "@/lib/format";

import { approveSelectionOptionAction } from "./actions";
import { CreateAllowanceForm } from "./create-allowance-form";
import { CreateSelectionForm } from "./create-selection-form";
import { AllowancesGrid, SelectionsListGrid } from "./selections-grids";

export const dynamic = "force-dynamic";

const STATUS_STYLE: Record<string, { bg: string; text: string }> = {
  PENDING: { bg: "#e5e7eb", text: "#374151" },
  APPROVED: { bg: "var(--bt-status-open-bg)", text: "var(--bt-status-open-text)" },
  DECLINED: { bg: "color-mix(in srgb, var(--bt-danger) 14%, transparent)", text: "var(--bt-danger)" },
};

const VIEWS = [
  { key: "cards", label: "Card view" },
  { key: "list", label: "List view" },
  { key: "allowances", label: "Allowances" },
] as const;
type ViewKey = (typeof VIEWS)[number]["key"];

export default async function SelectionsPage({ params, searchParams }: PageProps<"/jobs/[jobId]/selections">) {
  const { jobId } = await params;
  const { view: viewParam } = await searchParams;
  const view: ViewKey = VIEWS.some((v) => v.key === viewParam) ? (viewParam as ViewKey) : "cards";

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
    db.allowance.findMany({
      where: { jobId: job.id },
      orderBy: { title: "asc" },
      select: { id: true, title: true, amountCents: true, clientPriceCents: true, costCode: { select: { code: true, name: true } }, _count: { select: { selections: true } } },
    }),
    db.costCode.findMany({
      where: { organizationId: user.organizationId, isActive: true },
      orderBy: { sortOrder: "asc" },
      select: { id: true, code: true, name: true },
    }),
  ]);

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4 p-6">
      <PageHeader
        jobName={job.name}
        title="Selections"
        action={
          <div className="flex items-center gap-2">
            <CreateModal triggerLabel="+ Allowance" title="New allowance" variant="secondary">
              <CreateAllowanceForm jobId={job.id} costCodes={costCodes} />
            </CreateModal>
            <CreateModal triggerLabel="+ Selection" title="New selection">
              <CreateSelectionForm jobId={job.id} allowances={allowances} />
            </CreateModal>
          </div>
        }
      />


      <nav className="flex gap-1 border-b" style={{ borderColor: "var(--bt-border)" }}>
        {VIEWS.map((v) => (
          <Link
            key={v.key}
            href={`/jobs/${job.id}/selections?view=${v.key}`}
            className="-mb-px border-b-2 px-3 py-2 text-sm font-medium transition"
            style={{ borderColor: v.key === view ? "var(--bt-primary)" : "transparent", color: v.key === view ? "var(--bt-primary)" : "var(--bt-muted)" }}
          >
            {v.label}
          </Link>
        ))}
      </nav>

      {view === "allowances" ? (
        <AllowancesGrid
          rows={allowances.map((allowance) => ({
            id: allowance.id,
            title: allowance.title,
            costCode: `${allowance.costCode.code} ${allowance.costCode.name}`,
            amountCents: allowance.amountCents,
            clientPriceCents: allowance.clientPriceCents,
            selectionCount: allowance._count.selections,
          }))}
        />
      ) : view === "list" ? (
        <SelectionsListGrid
          rows={selections.map((selection) => {
            const approved = selection.options.find((option) => option.status === "APPROVED");
            const status = approved ? "Approved" : selection.options.some((option) => option.status === "DECLINED") && !selection.options.some((o) => o.status === "PENDING") ? "Declined" : "Pending";
            return {
              id: selection.id,
              title: selection.title,
              allowanceTitle: allowances.find((allowance) => allowance.id === selection.allowanceId)?.title ?? null,
              dueDate: selection.dueDate ? selection.dueDate.toISOString() : null,
              status,
              optionCount: selection.options.length,
              approvedPriceCents: approved ? approved.clientPriceCents : null,
            };
          })}
        />
      ) : selections.length === 0 ? (
        <EmptyState title="No selections yet" description="Selections created for this job will appear here for the client to choose from." />
      ) : (
        <div className="flex flex-col gap-4">
          {selections.map((selection) => {
            const decided = selection.options.some((option) => option.status !== "PENDING");
            return (
              <section key={selection.id} className="rounded-lg border bg-[var(--bt-panel-bg)]" style={{ borderColor: "var(--bt-border)" }}>
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
