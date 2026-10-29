import Link from "next/link";
import { notFound } from "next/navigation";

import { SetupNotice } from "@/app/admin/setup-notice";
import { CreateModal } from "@/components/shell/CreateModal";
import { PageHeader } from "@/components/shell/PageHeader";
import { EmptyState } from "@/components/shell/EmptyState";
import { DocumentIcon } from "@/components/shell/icons";
import { currentAppUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatDate } from "@/lib/format";
import { listJobPlanFiles, resolveFileUrlsSafe } from "@/lib/files/service";
import { findOrgJobSummary } from "@/lib/jobs/request-job";

import { FileCard } from "../files/file-card";
import { UploadForm } from "../files/upload-form";

import { GenerateSpecForm } from "./generate-spec-form";

export const dynamic = "force-dynamic";

const TABS = [
  { key: "plans", label: "Plans" },
  { key: "specs", label: "Specs" },
] as const;

export default async function PlansAndSpecsPage({ params, searchParams }: PageProps<"/jobs/[jobId]/plans-and-specs">) {
  const { jobId } = await params;
  const { tab: tabParam } = await searchParams;
  const tab = tabParam === "specs" ? "specs" : "plans";

  let user;
  try {
    user = await currentAppUser();
  } catch (error) {
    return <SetupNotice detail={error instanceof Error ? error.message : String(error)} />;
  }
  if (!user) {
    return <SetupNotice detail="No organization found. Seed the database, then reload." />;
  }

  const job = await findOrgJobSummary(user.organizationId, jobId);
  if (!job) notFound();

  const [planRows, specifications, estimates] = await Promise.all([
    listJobPlanFiles(user.organizationId, job.id),
    db.specification.findMany({
      where: { jobId: job.id },
      orderBy: { createdAt: "desc" },
      include: { sections: { orderBy: { sortOrder: "asc" } } },
    }),
    db.estimate.findMany({ where: { jobId: job.id }, orderBy: { createdAt: "desc" }, select: { id: true, title: true } }),
  ]);
  const signedUrls = await resolveFileUrlsSafe(planRows.map((file) => file.url));
  const plans = planRows.map((file, index) => ({
    id: file.id,
    fileName: file.fileName,
    category: file.category,
    url: signedUrls[index] ?? null,
    mimeType: file.mimeType,
    sizeBytes: file.sizeBytes,
    clientVisible: file.clientVisible,
    subVisible: file.subVisible,
    uploaderEmail: file.uploadedByUser?.email ?? "Inspector upload",
    uploadedAt: formatDate(file.createdAt),
  }));

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4 p-6">
      <PageHeader
        jobName={job.name}
        title="Plans and Specs"
        action={
          <div className="flex items-center gap-2">
            {tab === "specs" ? (
              <CreateModal triggerLabel="Generate from estimate" title="Generate specification from estimate" variant="secondary">
                <GenerateSpecForm jobId={job.id} estimates={estimates} />
              </CreateModal>
            ) : (
              <CreateModal triggerLabel="+ Plan" title="Add a plan">
                <UploadForm jobId={job.id} fixedCategory="PLAN" />
              </CreateModal>
            )}
          </div>
        }
      />

      <nav className="flex gap-1 border-b" style={{ borderColor: "var(--bt-border)" }}>
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={`/jobs/${job.id}/plans-and-specs${t.key === "plans" ? "" : `?tab=${t.key}`}`}
            className="-mb-px border-b-2 px-3 py-2 text-sm font-medium transition"
            style={{ borderColor: t.key === tab ? "var(--bt-primary)" : "transparent", color: t.key === tab ? "var(--bt-primary)" : "var(--bt-muted)" }}
          >
            {t.label}
          </Link>
        ))}
      </nav>

      {tab === "plans" ? (
        plans.length === 0 ? (
          <EmptyState
            icon={<DocumentIcon className="h-10 w-10" />}
            title="Add a plan"
            description="Upload blueprint plans to keep drawings, layouts, and revisions in one place. Your crew can view and reference them anytime."
            action={
              <CreateModal triggerLabel="+ Plan" title="Add a plan">
                <UploadForm jobId={job.id} fixedCategory="PLAN" />
              </CreateModal>
            }
          />
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {plans.map((plan) => (
              <FileCard key={plan.id} jobId={job.id} file={plan} />
            ))}
          </div>
        )
      ) : null}

      {tab === "specs" && specifications.length === 0 ? (
        <EmptyState
          icon={<DocumentIcon className="h-10 w-10" />}
          title="No specifications yet"
          description="Specification books generated for this job will appear here."
          action={
            <CreateModal triggerLabel="Generate from estimate" title="Generate specification from estimate" variant="secondary">
              <GenerateSpecForm jobId={job.id} estimates={estimates} />
            </CreateModal>
          }
        />
      ) : tab === "specs" ? (
        <div className="flex flex-col gap-4">
          {specifications.map((spec) => (
            <section key={spec.id} className="rounded-lg border bg-[var(--bt-panel-bg)]" style={{ borderColor: "var(--bt-border)" }}>
              <header className="flex items-center justify-between border-b px-4 py-3" style={{ borderColor: "var(--bt-border)" }}>
                <h2 className="text-sm font-semibold text-[var(--bt-text)]">{spec.title}</h2>
                <span className="text-xs text-[var(--bt-muted)]">{spec.sections.length} sections</span>
              </header>
              <div className="divide-y" style={{ borderColor: "var(--bt-border)" }}>
                {spec.sections.map((section) => (
                  <div key={section.id} className="px-4 py-3">
                    <div className="text-sm font-medium text-[var(--bt-text)]">{section.title}</div>
                    <p className="mt-1 whitespace-pre-wrap text-sm text-[var(--bt-muted)]">{section.body}</p>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      ) : null}
    </div>
  );
}
