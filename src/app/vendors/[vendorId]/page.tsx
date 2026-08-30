import Link from "next/link";
import { notFound } from "next/navigation";

import { SetupNotice } from "@/app/admin/setup-notice";
import { CommentThread } from "@/components/comments/CommentThread";
import { currentAppUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatDate } from "@/lib/format";

import { AddCertificationForm } from "./add-certification-form";
import { GrantJobAccessForm } from "./grant-job-access-form";
import { SyncToQuickBooksButton } from "./sync-to-quickbooks-button";

export const dynamic = "force-dynamic";

export default async function VendorDetailPage({ params }: PageProps<"/vendors/[vendorId]">) {
  const { vendorId } = await params;

  let user;
  try {
    user = await currentAppUser();
  } catch (error) {
    return <SetupNotice detail={error instanceof Error ? error.message : String(error)} />;
  }
  if (!user) {
    return <SetupNotice detail="No organization found. Seed the database, then reload." />;
  }

  const vendor = await db.vendor.findFirst({
    where: { id: vendorId, organizationId: user.organizationId },
    include: { jobAccess: { include: { job: { select: { id: true, name: true } } } }, certifications: { orderBy: { expiresAt: "asc" } } },
  });
  if (!vendor) notFound();

  const qboConnection = await db.quickBooksConnection.findUnique({ where: { organizationId: user.organizationId } });
  const isQboConnected = Boolean(qboConnection && !qboConnection.disconnectedAt);

  const jobs = await db.job.findMany({
    where: { organizationId: user.organizationId },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });

  const now = new Date();

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4 p-6">
      <div>
        <h1 className="text-xl font-semibold text-[var(--bt-text)]">{vendor.name}</h1>
        <p className="text-sm text-[var(--bt-muted)]">
          {vendor.tradeType ?? "No trade set"} · {vendor.email}
          {vendor.phone ? ` · ${vendor.phone}` : ""}
        </p>
        <p className="mt-1 text-xs text-[var(--bt-muted)]">
          {vendor.activatedAt ? `Activated ${formatDate(vendor.activatedAt)}` : vendor.invitedAt ? `Invited ${formatDate(vendor.invitedAt)}, not yet activated` : "Not invited to the vendor portal yet"}
        </p>
      </div>

      <section className="rounded-lg border bg-[var(--bt-panel-bg)] p-4" style={{ borderColor: "var(--bt-border)" }}>
        <h2 className="text-sm font-semibold text-[var(--bt-text)]">Job access</h2>
        {vendor.jobAccess.length === 0 ? (
          <p className="mt-2 text-sm text-[var(--bt-muted)]">Not assigned to any jobs yet.</p>
        ) : (
          <ul className="mt-2 divide-y" style={{ borderColor: "var(--bt-border)" }}>
            {vendor.jobAccess.map((access) => (
              <li key={access.id} className="flex items-center justify-between py-2 text-sm">
                <span className="font-medium text-[var(--bt-text)]">{access.job.name}</span>
                <span className="text-xs text-[var(--bt-muted)]">
                  {access.scheduleScope === "ALL_ITEMS" ? "All schedule items" : "Assigned items only"}
                </span>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-3">
          <GrantJobAccessForm vendorId={vendor.id} jobs={jobs} />
        </div>
      </section>

      <section className="rounded-lg border bg-[var(--bt-panel-bg)] p-4" style={{ borderColor: "var(--bt-border)" }}>
        <h2 className="text-sm font-semibold text-[var(--bt-text)]">Certifications</h2>
        {vendor.certifications.length === 0 ? (
          <p className="mt-2 text-sm text-[var(--bt-muted)]">No certifications on file.</p>
        ) : (
          <ul className="mt-2 divide-y" style={{ borderColor: "var(--bt-border)" }}>
            {vendor.certifications.map((cert) => {
              const expired = cert.expiresAt < now;
              return (
                <li key={cert.id} className="flex items-center justify-between py-2 text-sm">
                  <div>
                    <span className="font-medium text-[var(--bt-text)]">{cert.title}</span>
                    {cert.notes ? <span className="ml-2 text-xs text-[var(--bt-muted)]">{cert.notes}</span> : null}
                  </div>
                  <span className={expired ? "text-xs font-semibold text-red-600" : "text-xs text-[var(--bt-muted)]"}>
                    {expired ? "Expired " : "Expires "}
                    {formatDate(cert.expiresAt)}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
        <div className="mt-3">
          <AddCertificationForm vendorId={vendor.id} />
        </div>
      </section>

      <section className="rounded-lg border bg-[var(--bt-panel-bg)] p-4" style={{ borderColor: "var(--bt-border)" }}>
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-[var(--bt-text)]">QuickBooks status</h2>
          {isQboConnected ? <SyncToQuickBooksButton vendorId={vendor.id} label={vendor.qboVendorId ? "Re-sync" : "Sync to QuickBooks"} /> : null}
        </div>
        {!isQboConnected ? (
          <p className="mt-2 text-sm text-[var(--bt-muted)]">
            QuickBooks isn&apos;t connected for this organization —{" "}
            <Link href="/settings/quickbooks" className="text-[var(--bt-primary)] hover:underline">
              connect it in Settings
            </Link>{" "}
            to sync vendors.
          </p>
        ) : vendor.qboVendorId ? (
          <p className="mt-2 text-sm text-[var(--bt-text)]">
            Synced to QuickBooks as Vendor <span className="font-mono">{vendor.qboVendorId}</span>.
          </p>
        ) : (
          <p className="mt-2 text-sm text-[var(--bt-muted)]">Not sent to QuickBooks yet.</p>
        )}
      </section>

      <CommentThread organizationId={user.organizationId} featureType="Vendor" featureId={vendor.id} revalidate={`/vendors/${vendor.id}`} />
    </div>
  );
}
