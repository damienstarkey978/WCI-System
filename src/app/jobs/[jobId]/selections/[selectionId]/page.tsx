import Link from "next/link";
import { notFound } from "next/navigation";

import { SetupNotice } from "@/app/admin/setup-notice";
import { PageHeader } from "@/components/shell/PageHeader";
import { currentAppUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatDateUtc, formatMoney } from "@/lib/format";

import { approveSelectionOptionAction } from "../actions";
import { AddChoiceForm, SelectionDetailForm } from "./detail-forms";

export const dynamic = "force-dynamic";

const STATUS_STYLE: Record<string, { bg: string; text: string }> = {
  PENDING: { bg: "#e5e7eb", text: "#374151" },
  APPROVED: { bg: "var(--bt-status-open-bg)", text: "var(--bt-status-open-text)" },
  DECLINED: { bg: "color-mix(in srgb, var(--bt-danger) 14%, transparent)", text: "var(--bt-danger)" },
};

export default async function SelectionDetailPage({
  params,
  searchParams,
}: PageProps<"/jobs/[jobId]/selections/[selectionId]">) {
  const { jobId, selectionId } = await params;
  const { tab: tabParam } = await searchParams;
  const tab = tabParam === "description" ? "description" : "choices";

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

  const [selection, allowances] = await Promise.all([
    db.selection.findFirst({
      where: { id: selectionId, jobId: job.id, organizationId: user.organizationId },
      include: { options: { orderBy: { sortOrder: "asc" } }, allowance: { select: { id: true, title: true } } },
    }),
    db.allowance.findMany({
      where: { jobId: job.id },
      orderBy: { title: "asc" },
      select: { id: true, title: true },
    }),
  ]);
  if (!selection) notFound();

  const decided = selection.options.some((option) => option.status === "APPROVED");
  const editable = !decided;

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4 p-6">
      <div>
        <Link href={`/jobs/${job.id}/selections`} className="text-xs font-medium text-[var(--bt-primary)] hover:underline">
          ← Selections
        </Link>
        <PageHeader jobName={job.name} title="Selection" />
        <p className="mt-1 text-sm text-[var(--bt-muted)]">
          {selection.category || "Unassigned"}
          {selection.location ? ` · ${selection.location}` : ""}
          {selection.dueDate ? ` · Deadline ${formatDateUtc(selection.dueDate)}` : ""}
        </p>
      </div>

      <SelectionDetailForm
        jobId={job.id}
        selectionId={selection.id}
        editable={editable}
        allowances={allowances}
        initial={{
          title: selection.title,
          description: selection.description ?? "",
          dueDate: selection.dueDate ? selection.dueDate.toISOString().slice(0, 10) : "",
          category: selection.category ?? "",
          location: selection.location ?? "",
          requireClientSelection: selection.requireClientSelection,
          selectionType: selection.selectionType,
          allowanceId: selection.allowanceId ?? "",
        }}
      />

      <nav className="flex gap-1 border-b" style={{ borderColor: "var(--bt-border)" }}>
        {(
          [
            ["choices", "Choices"],
            ["description", "Description"],
          ] as const
        ).map(([key, label]) => (
          <Link
            key={key}
            href={`/jobs/${job.id}/selections/${selection.id}${key === "description" ? "?tab=description" : ""}`}
            className="-mb-px border-b-2 px-3 py-2 text-sm font-medium"
            style={{
              borderColor: tab === key ? "var(--bt-primary)" : "transparent",
              color: tab === key ? "var(--bt-primary)" : "var(--bt-muted)",
            }}
          >
            {label}
          </Link>
        ))}
      </nav>

      {tab === "choices" ? (
        <section className="rounded-lg border bg-[var(--bt-panel-bg)] p-4" style={{ borderColor: "var(--bt-border)" }}>
          {selection.options.length === 0 ? (
            <p className="mb-3 text-sm text-[var(--bt-muted)]">No choices yet. Add choices for the client to pick from.</p>
          ) : (
            <ul className="mb-4 divide-y" style={{ borderColor: "var(--bt-border)" }}>
              {selection.options.map((option) => {
                const style = STATUS_STYLE[option.status] ?? STATUS_STYLE.PENDING;
                return (
                  <li key={option.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                    <div>
                      <p className="text-sm font-medium text-[var(--bt-text)]">{option.title}</p>
                      {option.description ? <p className="text-xs text-[var(--bt-muted)]">{option.description}</p> : null}
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-sm">{formatMoney(option.clientPriceCents)}</span>
                      <span className="text-xs text-[var(--bt-muted)]">cost {formatMoney(option.priceCents)}</span>
                      <span className="rounded px-1.5 py-0.5 text-[10px] font-semibold" style={{ background: style.bg, color: style.text }}>
                        {option.status}
                      </span>
                      {editable ? (
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
                  </li>
                );
              })}
            </ul>
          )}
          {editable ? <AddChoiceForm jobId={job.id} selectionId={selection.id} /> : null}
        </section>
      ) : (
        <div className="rounded-lg border bg-[var(--bt-panel-bg)] p-4 text-sm whitespace-pre-wrap text-[var(--bt-text)]" style={{ borderColor: "var(--bt-border)" }}>
          {selection.description || <span className="text-[var(--bt-muted)]">No description.</span>}
        </div>
      )}
    </div>
  );
}
