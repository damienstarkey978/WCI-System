import Link from "next/link";
import { notFound } from "next/navigation";

import { SetupNotice } from "@/app/admin/setup-notice";
import { UserRole } from "@/generated/prisma/enums";
import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";

import { AdvancedSettingsForm } from "./advanced-settings-form";
import { ClientsTab } from "./clients-tab";
import { InternalUsersTab } from "./internal-users-tab";
import { JobDetailsForm } from "./job-details-form";
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

  let user;
  try {
    user = await requireRole(UserRole.ADMIN, UserRole.PM);
  } catch (error) {
    return <SetupNotice detail={error instanceof Error ? error.message : String(error)} />;
  }

  const job = await db.job.findFirst({ where: { id: jobId, organizationId: user.organizationId } });
  if (!job) notFound();

  const activeTab: TabKey = TABS.some((t) => t.key === tabParam) ? (tabParam as TabKey) : "details";

  const [jobGroups, clientAccess, allClients, userAccess, allStaff, vendorAccess, allVendors] = await Promise.all([
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
    db.vendor.findMany({ where: { organizationId: user.organizationId }, orderBy: { name: "asc" }, select: { id: true, name: true, tradeType: true } }),
  ]);

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-4 p-6">
      <div>
        <Link href={`/jobs/${job.id}`} className="text-sm text-[var(--bt-primary)] hover:underline">
          ← {job.name}
        </Link>
        <h1 className="mt-1 text-xl font-semibold text-[var(--bt-text)]">
          {job.name} <span className="text-sm font-normal text-[var(--bt-muted)]">({job.status})</span>
        </h1>
      </div>

      <div className="flex gap-1 border-b" style={{ borderColor: "var(--bt-border)" }}>
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={`/jobs/${job.id}/settings?tab=${t.key}`}
            className="border-b-2 px-3 py-2 text-sm font-medium"
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

      {activeTab === "details" ? <JobDetailsForm job={job} jobGroups={jobGroups} /> : null}

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
            tradeType: a.vendor.tradeType,
            scheduleScope: a.scheduleScope,
            canViewDocuments: a.canViewDocuments,
            canViewPurchaseOrders: a.canViewPurchaseOrders,
            canViewBills: a.canViewBills,
          }))}
          availableVendors={allVendors.filter((v) => !vendorAccess.some((a) => a.vendorId === v.id))}
        />
      ) : null}

      {activeTab === "advanced" ? <AdvancedSettingsForm job={job} /> : null}
    </div>
  );
}
