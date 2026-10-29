import { notFound } from "next/navigation";

import { SetupNotice } from "@/app/admin/setup-notice";
import { EmptyState } from "@/components/shell/EmptyState";
import { ReceiptIcon } from "@/components/shell/icons";
import { UserRole } from "@/generated/prisma/enums";
import { currentAppUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatCents } from "@/lib/money";
import { COMMISSION_COST_CODE, canAccessCommissionMenu } from "@/lib/staff/role-site-access";

import { FinancialPageHeader } from "../financial-tabs";

export const dynamic = "force-dynamic";

/**
 * Sales Rep Financial → Commission: bills whose line items use the org's
 * 01-COMMISSION cost code on jobs where this user is the salesperson.
 * Full job financials stay gated separately (default OFF for Sales Rep).
 */
export default async function CommissionPage({ params }: PageProps<"/jobs/[jobId]/commission">) {
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

  if (!canAccessCommissionMenu(user.role) && user.role !== UserRole.ADMIN && user.role !== UserRole.PM && user.role !== UserRole.OFFICE) {
    return (
      <div className="mx-auto max-w-2xl p-6">
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
          Commission is available for Sales Reps. Your role doesn&apos;t use this view.
        </div>
      </div>
    );
  }

  const job = await db.job.findFirst({
    where: {
      id: jobId,
      organizationId: user.organizationId,
      ...(user.role === UserRole.SALES_REP ? { salespersonUserId: user.id } : {}),
    },
    select: { id: true, name: true },
  });
  if (!job) notFound();

  const bills = await db.bill.findMany({
    where: {
      jobId: job.id,
      approvalStatus: { not: "VOID" },
      lineItems: { some: { costCode: { code: COMMISSION_COST_CODE } } },
      ...(user.role === UserRole.SALES_REP
        ? {
            // Only commission lines matter for the rep's view — still scoped to their job above.
          }
        : {}),
    },
    orderBy: { createdAt: "desc" },
    include: {
      lineItems: {
        where: { costCode: { code: COMMISSION_COST_CODE } },
        include: { costCode: { select: { code: true, name: true } } },
      },
      createdByUser: { select: { name: true, email: true } },
    },
  });

  const totalCents = bills.reduce((sum, bill) => sum + bill.lineItems.reduce((s, line) => s + line.amountCents, 0), 0);

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-4 p-4 sm:p-6">
      <FinancialPageHeader jobName={job.name} title="Commission" />
      <p className="text-sm text-[var(--bt-muted)]">
        Bills coded to {COMMISSION_COST_CODE} (Commission) on this job
        {user.role === UserRole.SALES_REP ? " — your salesperson view" : ""}.
      </p>

      {bills.length === 0 ? (
        <EmptyState
          icon={<ReceiptIcon className="h-10 w-10 text-[var(--bt-muted)]" />}
          title="No commission bills yet"
          description={`When a bill is entered against cost code ${COMMISSION_COST_CODE}, it will show here.`}
        />
      ) : (
        <div className="overflow-x-auto rounded-lg border bg-[var(--bt-panel-bg)]" style={{ borderColor: "var(--bt-border)" }}>
          <table className="min-w-full text-left text-sm">
            <thead className="border-b text-xs uppercase tracking-wide text-[var(--bt-muted)]" style={{ borderColor: "var(--bt-border)" }}>
              <tr>
                <th className="px-3 py-2 font-semibold">Bill</th>
                <th className="px-3 py-2 font-semibold">Vendor</th>
                <th className="px-3 py-2 font-semibold">Status</th>
                <th className="px-3 py-2 font-semibold text-right">Commission</th>
              </tr>
            </thead>
            <tbody>
              {bills.map((bill) => {
                const amount = bill.lineItems.reduce((s, line) => s + line.amountCents, 0);
                return (
                  <tr key={bill.id} className="border-b last:border-0" style={{ borderColor: "var(--bt-border)" }}>
                    <td className="px-3 py-2.5">
                      <div className="font-medium text-[var(--bt-text)]">{bill.title ?? bill.billNumber ?? "Commission bill"}</div>
                      <div className="text-xs text-[var(--bt-muted)]">{bill.billNumber ? `#${bill.billNumber}` : bill.id.slice(0, 8)}</div>
                    </td>
                    <td className="px-3 py-2.5 text-[var(--bt-text)]">{bill.vendorName}</td>
                    <td className="px-3 py-2.5 text-[var(--bt-muted)]">{bill.approvalStatus.replaceAll("_", " ")}</td>
                    <td className="px-3 py-2.5 text-right font-medium tabular-nums text-[var(--bt-text)]">{formatCents(amount)}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t font-semibold" style={{ borderColor: "var(--bt-border)" }}>
                <td className="px-3 py-2.5" colSpan={3}>
                  Total
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums">{formatCents(totalCents)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
