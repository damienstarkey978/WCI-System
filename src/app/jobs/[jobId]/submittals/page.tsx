import Link from "next/link";
import { notFound } from "next/navigation";

import { SetupNotice } from "@/app/admin/setup-notice";
import { CreateModal } from "@/components/shell/CreateModal";
import { PageHeader } from "@/components/shell/PageHeader";
import { EmptyState } from "@/components/shell/EmptyState";
import { currentAppUser } from "@/lib/auth";
import { db } from "@/lib/db";

import { CreateSubmittalForm } from "./create-submittal-form";
import { SubmittalsGrid } from "./submittals-grid";

export const dynamic = "force-dynamic";

const VIEW_TABS = [
  { key: "log", label: "Submittal log" },
  { key: "packages", label: "Packages" },
] as const;

const STATUS_TABS = [
  { key: "all", label: "All" },
  { key: "DRAFT", label: "Draft" },
  { key: "PENDING", label: "Needs review" },
  { key: "IN_APPROVAL", label: "In approval" },
  { key: "APPROVED", label: "Approved" },
  { key: "APPROVED_AS_NOTED", label: "Approved as noted" },
  { key: "REVISE_AND_RESUBMIT", label: "Revise and resubmit" },
  { key: "REJECTED", label: "Rejected" },
  { key: "VOIDED", label: "Voided" },
  { key: "AWAITING_DOCUMENTS", label: "Awaiting documents" },
] as const;

export default async function SubmittalsPage({ params, searchParams }: PageProps<"/jobs/[jobId]/submittals">) {
  const { jobId } = await params;
  const { tab: tabParam, status: statusParam } = await searchParams;
  const view = VIEW_TABS.some((t) => t.key === tabParam) ? (tabParam as (typeof VIEW_TABS)[number]["key"]) : "log";
  const statusTab = STATUS_TABS.some((t) => t.key === statusParam) ? (statusParam as (typeof STATUS_TABS)[number]["key"]) : "all";

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

  const [submittals, users, vendors] = await Promise.all([
    view === "log"
      ? db.submittal.findMany({
          where: {
            jobId: job.id,
            ...(statusTab === "all" ? {} : { status: statusTab as never }),
          },
          orderBy: { number: "desc" },
          include: {
            revisions: { orderBy: { revisionNumber: "desc" }, take: 1 },
            managerUser: { select: { name: true, email: true } },
          },
        })
      : Promise.resolve([]),
    db.user.findMany({
      where: { organizationId: user.organizationId, isActive: true },
      orderBy: { email: "asc" },
      select: { id: true, email: true, name: true },
    }),
    db.vendor.findMany({
      where: { organizationId: user.organizationId },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);

  const packageNames = Array.from(
    new Set(
      (
        await db.submittal.findMany({
          where: { jobId: job.id, packageName: { not: null } },
          select: { packageName: true },
        })
      )
        .map((s) => s.packageName)
        .filter((name): name is string => Boolean(name)),
    ),
  ).sort((a, b) => a.localeCompare(b));

  const createModal = (
    <CreateModal triggerLabel="+ Submittal" title="New submittal" size="lg">
      <CreateSubmittalForm jobId={job.id} users={users} vendors={vendors} defaultManagerUserId={user.id} />
    </CreateModal>
  );

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4 p-6">
      <PageHeader jobName={job.name} title="Submittals" action={createModal} />

      <nav className="flex gap-1 border-b" style={{ borderColor: "var(--bt-border)" }}>
        {VIEW_TABS.map((t) => (
          <Link
            key={t.key}
            href={`/jobs/${job.id}/submittals${t.key === "log" ? "" : `?tab=${t.key}`}`}
            className="-mb-px border-b-2 px-3 py-2 text-sm font-medium transition"
            style={{
              borderColor: t.key === view ? "var(--bt-primary)" : "transparent",
              color: t.key === view ? "var(--bt-primary)" : "var(--bt-muted)",
            }}
          >
            {t.label}
          </Link>
        ))}
      </nav>

      {view === "packages" ? (
        packageNames.length === 0 ? (
          <EmptyState
            title="Add a package"
            description="Group submittals together to stay organized and track progress more easily. Enter a package name on a submittal to start."
            action={
              <CreateModal triggerLabel="+ Add a package" title="New submittal" size="lg">
                <CreateSubmittalForm jobId={job.id} users={users} vendors={vendors} defaultManagerUserId={user.id} />
              </CreateModal>
            }
          />
        ) : (
          <ul className="divide-y rounded-lg border bg-[var(--bt-panel-bg)]" style={{ borderColor: "var(--bt-border)" }}>
            {packageNames.map((name) => (
              <li key={name} className="px-4 py-3 text-sm font-medium text-[var(--bt-text)]">
                {name}
              </li>
            ))}
          </ul>
        )
      ) : (
        <>
          <nav className="flex flex-wrap gap-1">
            {STATUS_TABS.map((t) => (
              <Link
                key={t.key}
                href={`/jobs/${job.id}/submittals${t.key === "all" ? "" : `?status=${t.key}`}`}
                className="rounded-full px-2.5 py-1 text-xs font-medium"
                style={{
                  background: t.key === statusTab ? "color-mix(in srgb, var(--bt-primary) 14%, transparent)" : "transparent",
                  color: t.key === statusTab ? "var(--bt-primary)" : "var(--bt-muted)",
                }}
              >
                {t.label}
              </Link>
            ))}
          </nav>

          {submittals.length === 0 ? (
            <EmptyState
              title="Add a Submittal"
              description="Send submittals and manage approvals for materials, plans, and other job requirements."
              action={
                <CreateModal triggerLabel="+ Add a Submittal" title="New submittal" size="lg">
                  <CreateSubmittalForm jobId={job.id} users={users} vendors={vendors} defaultManagerUserId={user.id} />
                </CreateModal>
              }
            />
          ) : (
            <SubmittalsGrid
              rows={submittals.map((submittal) => ({
                id: submittal.id,
                jobId: job.id,
                number: submittal.number,
                title: submittal.title,
                type: submittal.type,
                status: submittal.status,
                packageName: submittal.packageName,
                division: submittal.division,
                finalDueDate: submittal.finalDueDate ? submittal.finalDueDate.toISOString() : null,
                managerName: submittal.managerUser?.name || submittal.managerUser?.email || null,
                latestRevisionNumber: submittal.revisions[0]?.revisionNumber ?? null,
                latestRevisionAt: submittal.revisions[0] ? submittal.revisions[0].createdAt.toISOString() : null,
              }))}
            />
          )}
        </>
      )}
    </div>
  );
}
