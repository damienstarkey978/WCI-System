import Link from "next/link";
import { notFound } from "next/navigation";

import { SetupNotice } from "@/app/admin/setup-notice";
import { CreateModal } from "@/components/shell/CreateModal";
import { PageHeader } from "@/components/shell/PageHeader";
import { EmptyState } from "@/components/shell/EmptyState";
import { ClipboardIcon } from "@/components/shell/icons";
import { currentAppUser } from "@/lib/auth";
import { db } from "@/lib/db";

import { CreateRfiForm } from "./create-rfi-form";
import { RfisGrid } from "./rfis-grid";

export const dynamic = "force-dynamic";

const TABS = [
  { key: "all", label: "All RFIs" },
  { key: "open", label: "Open" },
  { key: "answered", label: "Answered" },
  { key: "closed", label: "Closed" },
] as const;

export default async function RfisPage({ params, searchParams }: PageProps<"/jobs/[jobId]/rfis">) {
  const { jobId } = await params;
  const { tab: tabParam } = await searchParams;
  const tab = TABS.some((t) => t.key === tabParam) ? (tabParam as (typeof TABS)[number]["key"]) : "all";

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

  const statusWhere =
    tab === "open"
      ? ({ status: "OPEN" as const })
      : tab === "answered"
        ? ({ status: "ANSWERED" as const })
        : tab === "closed"
          ? ({ status: "CLOSED" as const })
          : {};

  const [rfis, users] = await Promise.all([
    db.rfi.findMany({
      where: { jobId: job.id, ...statusWhere },
      orderBy: { number: "desc" },
      include: { assigneeUser: { select: { email: true, name: true } } },
    }),
    db.user.findMany({
      where: { organizationId: user.organizationId, isActive: true },
      orderBy: { email: "asc" },
      select: { id: true, email: true, name: true },
    }),
  ]);

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4 p-6">
      <PageHeader
        jobName={job.name}
        title="RFIs"
        action={
          <CreateModal triggerLabel="+ RFI" title="New RFI" size="lg">
            <CreateRfiForm jobId={job.id} users={users} />
          </CreateModal>
        }
      />

      <nav className="flex gap-1 border-b" style={{ borderColor: "var(--bt-border)" }}>
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={`/jobs/${job.id}/rfis${t.key === "all" ? "" : `?tab=${t.key}`}`}
            className="-mb-px border-b-2 px-3 py-2 text-sm font-medium transition"
            style={{
              borderColor: t.key === tab ? "var(--bt-primary)" : "transparent",
              color: t.key === tab ? "var(--bt-primary)" : "var(--bt-muted)",
            }}
          >
            {t.label}
          </Link>
        ))}
      </nav>

      {rfis.length === 0 ? (
        <EmptyState
          icon={<ClipboardIcon className="h-10 w-10" />}
          title="Clarify the unknown with RFIs"
          description="Streamline formal requests for information with Subs/Vendors to keep the project moving."
          action={
            <CreateModal triggerLabel="+ RFI" title="New RFI" size="lg">
              <CreateRfiForm jobId={job.id} users={users} />
            </CreateModal>
          }
        />
      ) : (
        <RfisGrid
          rows={rfis.map((rfi) => ({
            id: rfi.id,
            jobId: job.id,
            number: rfi.number,
            title: rfi.title,
            status: rfi.status,
            dueDate: rfi.dueDate ? rfi.dueDate.toISOString() : null,
            createdAt: rfi.createdAt.toISOString(),
            assignee: rfi.assigneeUser ? rfi.assigneeUser.name || rfi.assigneeUser.email : null,
          }))}
        />
      )}
    </div>
  );
}
