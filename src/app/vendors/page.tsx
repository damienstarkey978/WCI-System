import Link from "next/link";

import { EmptyState } from "@/components/shell/EmptyState";
import { currentAppUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { SetupNotice } from "@/app/admin/setup-notice";

import { CreateVendorForm } from "./create-vendor-form";

export const dynamic = "force-dynamic";

export default async function VendorsPage() {
  let user;
  try {
    user = await currentAppUser();
  } catch (error) {
    return <SetupNotice detail={error instanceof Error ? error.message : String(error)} />;
  }
  if (!user) {
    return <SetupNotice detail="No organization found. Seed the database, then reload." />;
  }

  const vendors = await db.vendor.findMany({
    where: { organizationId: user.organizationId },
    orderBy: { name: "asc" },
    include: { jobAccess: true },
  });

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-4 p-6">
      <h1 className="text-xl font-semibold text-[var(--bt-text)]">Vendors</h1>

      <CreateVendorForm />

      {vendors.length === 0 ? (
        <EmptyState title="No vendors yet" description="Vendors you add will appear here, ready to invite to bids and assign to jobs." />
      ) : (
        <div className="overflow-hidden rounded-lg border bg-[var(--bt-panel-bg)]" style={{ borderColor: "var(--bt-border)" }}>
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b text-xs font-semibold uppercase tracking-wide text-[var(--bt-muted)]" style={{ borderColor: "var(--bt-border)" }}>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Trade</th>
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3">Jobs</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {vendors.map((vendor) => (
                <tr key={vendor.id} className="border-b last:border-0" style={{ borderColor: "var(--bt-border)" }}>
                  <td className="px-4 py-3">
                    <Link href={`/vendors/${vendor.id}`} className="font-medium text-[var(--bt-primary)] hover:underline">
                      {vendor.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-[var(--bt-muted)]">{vendor.tradeType ?? "—"}</td>
                  <td className="px-4 py-3 text-[var(--bt-muted)]">{vendor.email}</td>
                  <td className="px-4 py-3 text-[var(--bt-muted)]">{vendor.jobAccess.length}</td>
                  <td className="px-4 py-3 text-[var(--bt-muted)]">
                    {vendor.activatedAt ? "Activated" : vendor.invitedAt ? "Invited" : "Not invited"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
