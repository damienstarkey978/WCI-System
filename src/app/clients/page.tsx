import Link from "next/link";

import { EmptyState } from "@/components/shell/EmptyState";
import { currentAppUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { SetupNotice } from "@/app/admin/setup-notice";

import { CreateClientForm } from "./create-client-form";

export const dynamic = "force-dynamic";

export default async function ClientsPage() {
  let user;
  try {
    user = await currentAppUser();
  } catch (error) {
    return <SetupNotice detail={error instanceof Error ? error.message : String(error)} />;
  }
  if (!user) {
    return <SetupNotice detail="No organization found. Seed the database, then reload." />;
  }

  const clients = await db.client.findMany({
    where: { organizationId: user.organizationId },
    orderBy: { name: "asc" },
    include: { jobAccess: true },
  });

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-4 p-6">
      <h1 className="text-xl font-semibold text-[var(--bt-text)]">Clients</h1>

      <CreateClientForm />

      {clients.length === 0 ? (
        <EmptyState title="No clients yet" description="Clients you add will appear here, ready to grant portal access to a job." />
      ) : (
        <div className="overflow-hidden rounded-lg border bg-white" style={{ borderColor: "var(--bt-border)" }}>
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b text-xs font-semibold uppercase tracking-wide text-[var(--bt-muted)]" style={{ borderColor: "var(--bt-border)" }}>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3">Jobs</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {clients.map((client) => (
                <tr key={client.id} className="border-b last:border-0" style={{ borderColor: "var(--bt-border)" }}>
                  <td className="px-4 py-3">
                    <Link href={`/clients/${client.id}`} className="font-medium text-[var(--bt-primary)] hover:underline">
                      {client.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-[var(--bt-muted)]">{client.email}</td>
                  <td className="px-4 py-3 text-[var(--bt-muted)]">{client.jobAccess.length}</td>
                  <td className="px-4 py-3 text-[var(--bt-muted)]">
                    {client.activatedAt ? "Activated" : client.invitedAt ? "Invited" : "Not invited"}
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
