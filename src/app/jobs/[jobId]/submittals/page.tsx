import { notFound } from "next/navigation";

import { SetupNotice } from "@/app/admin/setup-notice";
import { EmptyState } from "@/components/shell/EmptyState";
import { currentAppUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatDate } from "@/lib/format";

import { CreateSubmittalForm } from "./create-submittal-form";

export const dynamic = "force-dynamic";

const STATUS_STYLE: Record<string, { bg: string; text: string }> = {
  PENDING: { bg: "#fef3c7", text: "#92400e" },
  APPROVED: { bg: "var(--bt-status-open-bg)", text: "var(--bt-status-open-text)" },
  REJECTED: { bg: "#fee2e2", text: "#991b1b" },
  REVISE_AND_RESUBMIT: { bg: "#e0e7ff", text: "#3730a3" },
};

const TYPE_LABEL: Record<string, string> = {
  MATERIAL_SPEC: "Material spec",
  SHOP_DRAWING: "Shop drawing",
};

export default async function SubmittalsPage({ params }: PageProps<"/jobs/[jobId]/submittals">) {
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

  const submittals = await db.submittal.findMany({
    where: { jobId: job.id },
    orderBy: { createdAt: "desc" },
    include: { revisions: { orderBy: { revisionNumber: "desc" }, take: 1 } },
  });

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4 p-6">
      <h1 className="text-xl font-semibold text-[var(--bt-text)]">Submittals — {job.name}</h1>

      <CreateSubmittalForm jobId={job.id} />

      {submittals.length === 0 ? (
        <EmptyState title="No submittals yet" description="Material specs and shop drawings for this job will appear here." />
      ) : (
        <div className="overflow-hidden rounded-lg border bg-[var(--bt-panel-bg)]" style={{ borderColor: "var(--bt-border)" }}>
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b text-xs font-semibold uppercase tracking-wide text-[var(--bt-muted)]" style={{ borderColor: "var(--bt-border)" }}>
                <th className="px-4 py-3">Title</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Latest revision</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {submittals.map((submittal) => {
                const style = STATUS_STYLE[submittal.status] ?? STATUS_STYLE.PENDING;
                const latest = submittal.revisions[0];
                return (
                  <tr key={submittal.id} className="border-b last:border-0" style={{ borderColor: "var(--bt-border)" }}>
                    <td className="px-4 py-3 font-medium text-[var(--bt-text)]">{submittal.title}</td>
                    <td className="px-4 py-3 text-[var(--bt-muted)]">{TYPE_LABEL[submittal.type] ?? submittal.type}</td>
                    <td className="px-4 py-3 text-[var(--bt-muted)]">
                      {latest ? `Rev ${latest.revisionNumber} — ${formatDate(latest.createdAt)}` : "—"}
                    </td>
                    <td className="px-4 py-3">
                      <span className="rounded px-1.5 py-0.5 text-[10px] font-semibold" style={{ background: style.bg, color: style.text }}>
                        {submittal.status.replace(/_/g, " ")}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
