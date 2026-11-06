import Link from "next/link";
import { notFound } from "next/navigation";

import { SetupNotice } from "@/app/admin/setup-notice";
import { EmptyState } from "@/components/shell/EmptyState";
import { RfiIcon } from "@/components/shell/icons";
import { currentAppUser } from "@/lib/auth";
import { db } from "@/lib/db";

import { CreateRfiModal } from "./create-rfi-modal";
import { RfisChrome } from "./rfis-chrome";
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
  const { tab: tabParam, q: qParam } = await searchParams;
  const tab = TABS.some((t) => t.key === tabParam) ? (tabParam as (typeof TABS)[number]["key"]) : "all";
  const q = typeof qParam === "string" ? qParam.trim() : "";

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
      where: {
        jobId: job.id,
        ...statusWhere,
        ...(q
          ? {
              OR: [
                { title: { contains: q, mode: "insensitive" as const } },
                { question: { contains: q, mode: "insensitive" as const } },
              ],
            }
          : {}),
      },
      orderBy: { number: "desc" },
      include: { assigneeUser: { select: { email: true, name: true } } },
    }),
    db.user.findMany({
      where: { organizationId: user.organizationId, isActive: true },
      orderBy: { email: "asc" },
      select: { id: true, email: true, name: true },
    }),
  ]);

  const createModal = <CreateRfiModal jobId={job.id} jobName={job.name} users={users} />;
  const emptyCreate = (
    <CreateRfiModal jobId={job.id} jobName={job.name} users={users} triggerLabel="Add an RFI" />
  );
  const filterActive = tab !== "all" || Boolean(q);
  const totalOnJob = filterActive
    ? await db.rfi.count({ where: { jobId: job.id } })
    : rfis.length;

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4 p-6">
      <RfisChrome key={`${tab}|${q}`} jobId={job.id} jobName={job.name} tab={tab} q={q} createAction={createModal}>
        <nav className="flex gap-1 border-b" style={{ borderColor: "var(--bt-border)" }}>
          {TABS.map((t) => {
            const params = new URLSearchParams();
            if (t.key !== "all") params.set("tab", t.key);
            if (q) params.set("q", q);
            const qs = params.toString();
            return (
              <Link
                key={t.key}
                href={qs ? `/jobs/${job.id}/rfis?${qs}` : `/jobs/${job.id}/rfis`}
                className="-mb-px border-b-2 px-3 py-2 text-sm font-medium transition"
                style={{
                  borderColor: t.key === tab ? "var(--bt-primary)" : "transparent",
                  color: t.key === tab ? "var(--bt-primary)" : "var(--bt-muted)",
                }}
              >
                {t.label}
              </Link>
            );
          })}
        </nav>

        {rfis.length === 0 ? (
          <>
            <EmptyState
              icon={<RfiIcon className="h-12 w-12" />}
              title={
                filterActive
                  ? "No RFIs match the filter"
                  : totalOnJob === 0
                    ? "Clarify the unknown with RFIs"
                    : "No RFIs in this view"
              }
              description={
                filterActive
                  ? "Try clearing status or keyword filters."
                  : totalOnJob === 0
                    ? "Streamline formal requests for information with Subs/Vendors to keep the project moving."
                    : "Switch tabs or create a new RFI."
              }
              action={filterActive ? undefined : emptyCreate}
            />
            {/* BT empty list still shows Standard View + 1-0 of 0 chrome under the hero. */}
            <div
              className="flex flex-wrap items-center justify-between gap-2 border-t pt-3 text-sm text-[var(--bt-muted)]"
              style={{ borderColor: "var(--bt-border)" }}
            >
              <span className="inline-flex items-center gap-1 rounded border px-2.5 py-1 text-xs font-medium text-[var(--bt-text)]" style={{ borderColor: "var(--bt-border)" }}>
                Standard View
              </span>
              <span>1-0 of 0 items</span>
            </div>
          </>
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
      </RfisChrome>
    </div>
  );
}
