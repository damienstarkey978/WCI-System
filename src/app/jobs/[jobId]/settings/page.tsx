import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { SetupNotice } from "@/app/admin/setup-notice";
import { UserRole } from "@/generated/prisma/enums";
import { currentAppUser, requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { allowedNextStatusesForRole } from "@/lib/job-status";
import { formatMoney } from "@/lib/format";
import { vendorTradeLabel } from "@/lib/vendor-portal/labels";

import { AdvancedSettingsForm } from "./advanced-settings-form";
import { ClientsTab } from "./clients-tab";
import { InternalUsersTab } from "./internal-users-tab";
import { JOB_DETAILS_FORM_ID, JobDetailsForm } from "./job-details-form";
import { JobStatusControl } from "./job-status-control";
import { SubsVendorsTab } from "./subs-vendors-tab";

export const dynamic = "force-dynamic";

const TABS = [
  { key: "details", label: "Job details" },
  { key: "clients", label: "Clients" },
  { key: "internal-users", label: "Internal users" },
  { key: "subs-vendors", label: "Subs/vendors" },
  { key: "advanced", label: "Advanced settings" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

/**
 * The job "edit record" Buildertrend reaches by clicking a job in the Jobs list —
 * distinct from /jobs/[jobId] (the "Job Info" overview dashboard). Every field and
 * permission grant here already existed in the schema (ClientJobAccess,
 * JobAccessGrant, VendorJobAccess, Job's own advanced-settings columns) with no
 * dedicated UI until now.
 */
export default async function JobSettingsPage({ params, searchParams }: PageProps<"/jobs/[jobId]/settings">) {
  const { jobId } = await params;
  const { tab: tabParam } = await searchParams;

  // Field and office users have no edit rights here; Job Info for them is the read only overview.
  const viewer = await currentAppUser().catch(() => null);
  if (viewer && viewer.role !== UserRole.ADMIN && viewer.role !== UserRole.PM) redirect(`/jobs/${jobId}`);

  let user;
  try {
    user = await requireRole(UserRole.ADMIN, UserRole.PM);
  } catch (error) {
    return <SetupNotice detail={error instanceof Error ? error.message : String(error)} />;
  }

  const job = await db.job.findFirst({ where: { id: jobId, organizationId: user.organizationId } });
  if (!job) notFound();

  const activeTab: TabKey = TABS.some((t) => t.key === tabParam) ? (tabParam as TabKey) : "details";

  const [jobGroups, clientAccess, allClients, userAccess, allStaff, vendorAccess, allVendors, relatedLead, budgetLines, jobTypeRows] = await Promise.all([
    db.jobGroup.findMany({ where: { organizationId: user.organizationId }, orderBy: { name: "asc" } }),
    db.clientJobAccess.findMany({ where: { jobId: job.id }, include: { client: true }, orderBy: { client: { name: "asc" } } }),
    db.client.findMany({ where: { organizationId: user.organizationId }, orderBy: { name: "asc" }, select: { id: true, name: true, email: true } }),
    db.jobAccessGrant.findMany({ where: { jobId: job.id }, include: { user: true }, orderBy: { user: { name: "asc" } } }),
    db.user.findMany({
      where: { organizationId: user.organizationId, isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true, email: true, role: true },
    }),
    db.vendorJobAccess.findMany({ where: { jobId: job.id }, include: { vendor: true }, orderBy: { vendor: { name: "asc" } } }),
    db.vendor.findMany({ where: { organizationId: user.organizationId }, orderBy: { name: "asc" }, select: { id: true, name: true, tradeType: true, divisions: true } }),
    db.lead.findFirst({ where: { convertedJobId: job.id, organizationId: user.organizationId }, select: { id: true, title: true, name: true, stage: true } }),
    db.budgetLine.findMany({ where: { jobId: job.id }, select: { revisedClientPriceCents: true } }),
    db.job.findMany({ where: { organizationId: user.organizationId }, select: { customFields: true }, take: 500 }),
  ]);

  const STAGE_LABEL: Record<string, string> = { NEW: "New", CONTACTED: "Contacted", QUALIFIED: "Qualified", PROPOSAL_SENT: "Proposal sent", WON: "Sold", LOST: "Lost" };
  const jobTypeSuggestions = [
    ...new Set(
      jobTypeRows
        .map((row) => (typeof row.customFields === "object" && row.customFields !== null && !Array.isArray(row.customFields) ? (row.customFields as Record<string, unknown>).jobType : null))
        .filter((value): value is string => typeof value === "string" && value.trim() !== ""),
    ),
  ].sort((a, b) => a.localeCompare(b));
  const contractPriceCents = budgetLines.reduce((total, line) => total + line.revisedClientPriceCents, 0);
  const projectManagers = userAccess.filter((a) => a.user.role === UserRole.PM).map((a) => ({ id: a.userId, name: a.user.name ?? a.user.email }));

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-4 p-6">
      <div className="flex items-start justify-between gap-3">
        <Link href="/jobs" aria-label="Back to jobs" className="mt-2 text-xl text-[var(--bt-muted)] hover:text-[var(--bt-text)]">
          ←
        </Link>
        <div className="flex flex-1 flex-col gap-2">
          {activeTab === "details" ? (
            <input
              form={JOB_DETAILS_FORM_ID}
              name="name"
              required
              defaultValue={job.name}
              aria-label="Job name"
              className="w-full max-w-3xl rounded-lg border px-4 py-2.5 text-xl font-semibold text-[var(--bt-text)] outline-none focus:border-[var(--bt-primary)]"
              style={{ borderColor: "var(--bt-border)" }}
            />
          ) : (
            <h1 className="text-xl font-semibold text-[var(--bt-text)]">{job.name}</h1>
          )}
          <span className="w-fit rounded px-2 py-0.5 text-xs font-semibold" style={{ background: "var(--bt-status-open-bg)", color: "var(--bt-status-open-text)" }}>
            {job.status === "PRE_SALE" ? "Pre-sale" : job.status.charAt(0) + job.status.slice(1).toLowerCase()}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Link href={`/jobs/${job.id}`} className="rounded border px-4 py-2 text-sm font-medium text-[var(--bt-text)]" style={{ borderColor: "var(--bt-border)" }}>
            {activeTab === "details" ? "Cancel" : "Job overview"}
          </Link>
          {activeTab === "details" ? (
            <button type="submit" form={JOB_DETAILS_FORM_ID} className="rounded px-5 py-2 text-sm font-semibold text-[var(--bt-on-primary)]" style={{ background: "var(--bt-primary)" }}>
              Save
            </button>
          ) : null}
        </div>
      </div>

      <div className="flex gap-1 overflow-x-auto border-b" style={{ borderColor: "var(--bt-border)" }}>
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={`/jobs/${job.id}/settings?tab=${t.key}`}
            className="shrink-0 border-b-2 px-3 py-2 text-sm font-medium whitespace-nowrap"
            style={
              activeTab === t.key
                ? { borderColor: "var(--bt-primary)", color: "var(--bt-primary)" }
                : { borderColor: "transparent", color: "var(--bt-muted)" }
            }
          >
            {t.label}
          </Link>
        ))}
      </div>

      {activeTab === "details" ? (
        <JobDetailsForm
          job={job}
          jobGroups={jobGroups}
          extras={{
            statusControl: <JobStatusControl jobId={job.id} current={job.status} next={allowedNextStatusesForRole(job.status, user.role)} />,
            contractPriceLabel: contractPriceCents > 0 ? formatMoney(contractPriceCents) : "Not set yet",
            relatedLead: relatedLead ? { id: relatedLead.id, title: relatedLead.title ?? relatedLead.name, stageLabel: STAGE_LABEL[relatedLead.stage] ?? relatedLead.stage } : null,
            jobTypeSuggestions,
            projectManagers,
          }}
        />
      ) : null}

      {activeTab === "clients" ? (
        <ClientsTab
          jobId={job.id}
          access={clientAccess.map((a) => ({
            clientId: a.clientId,
            name: a.client.name,
            email: a.client.email,
            canViewDailyLogs: a.canViewDailyLogs,
            canViewSchedule: a.canViewSchedule,
            canViewDocuments: a.canViewDocuments,
            canViewBudget: a.canViewBudget,
            canViewInvoices: a.canViewInvoices,
            canMakePayments: a.canMakePayments,
            canViewBills: a.canViewBills,
            canViewSelections: a.canViewSelections,
            canApproveSelections: a.canApproveSelections,
            canViewChangeOrders: a.canViewChangeOrders,
            canApproveChangeOrders: a.canApproveChangeOrders,
          }))}
          availableClients={allClients.filter((c) => !clientAccess.some((a) => a.clientId === c.id))}
        />
      ) : null}

      {activeTab === "internal-users" ? (
        <InternalUsersTab
          jobId={job.id}
          access={userAccess.map((a) => ({
            userId: a.userId,
            name: a.user.name ?? a.user.email,
            role: a.user.role,
            scheduleScope: a.scheduleScope,
            canViewPricing: a.canViewPricing,
            canViewCostDetail: a.canViewCostDetail,
            canManageSchedule: a.canManageSchedule,
            canApproveChangeOrders: a.canApproveChangeOrders,
            canViewDocuments: a.canViewDocuments,
            canCommunicateWithClient: a.canCommunicateWithClient,
          }))}
          availableStaff={allStaff.filter((s) => !userAccess.some((a) => a.userId === s.id))}
        />
      ) : null}

      {activeTab === "subs-vendors" ? (
        <SubsVendorsTab
          jobId={job.id}
          access={vendorAccess.map((a) => ({
            vendorId: a.vendorId,
            name: a.vendor.name,
            tradeType: vendorTradeLabel(a.vendor),
            scheduleScope: a.scheduleScope,
            canViewDocuments: a.canViewDocuments,
            canViewPurchaseOrders: a.canViewPurchaseOrders,
            canViewBills: a.canViewBills,
          }))}
          availableVendors={allVendors.filter((v) => !vendorAccess.some((a) => a.vendorId === v.id)).map((v) => ({ id: v.id, name: v.name, tradeType: vendorTradeLabel(v) }))}
        />
      ) : null}

      {activeTab === "advanced" ? <AdvancedSettingsForm job={job} /> : null}
    </div>
  );
}
