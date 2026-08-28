import { notFound } from "next/navigation";

import { SetupNotice } from "@/app/admin/setup-notice";
import { currentAppUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatDate } from "@/lib/format";

import { GrantJobAccessForm } from "./grant-job-access-form";
import { InvitePortalButton } from "./invite-button";

export const dynamic = "force-dynamic";

export default async function ClientDetailPage({ params }: PageProps<"/clients/[clientId]">) {
  const { clientId } = await params;

  let user;
  try {
    user = await currentAppUser();
  } catch (error) {
    return <SetupNotice detail={error instanceof Error ? error.message : String(error)} />;
  }
  if (!user) {
    return <SetupNotice detail="No organization found. Seed the database, then reload." />;
  }

  const client = await db.client.findFirst({
    where: { id: clientId, organizationId: user.organizationId },
    include: { jobAccess: { include: { job: { select: { id: true, name: true } } } } },
  });
  if (!client) notFound();

  const jobs = await db.job.findMany({
    where: { organizationId: user.organizationId },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4 p-6">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold text-[var(--bt-text)]">{client.name}</h1>
          <p className="text-sm text-[var(--bt-muted)]">
            {client.email}
            {client.phone ? ` · ${client.phone}` : ""}
          </p>
          <p className="mt-1 text-xs text-[var(--bt-muted)]">
            {client.activatedAt ? `Activated ${formatDate(client.activatedAt)}` : client.invitedAt ? `Invited ${formatDate(client.invitedAt)}, not yet activated` : "Not invited to the client portal yet"}
          </p>
        </div>
        <InvitePortalButton clientId={client.id} />
      </div>

      <section className="rounded-lg border bg-white p-4" style={{ borderColor: "var(--bt-border)" }}>
        <h2 className="text-sm font-semibold text-[var(--bt-text)]">Job access</h2>
        {client.jobAccess.length === 0 ? (
          <p className="mt-2 text-sm text-[var(--bt-muted)]">Not granted access to any jobs yet.</p>
        ) : (
          <ul className="mt-2 divide-y" style={{ borderColor: "var(--bt-border)" }}>
            {client.jobAccess.map((access) => (
              <li key={access.id} className="py-2 text-sm font-medium text-[var(--bt-text)]">
                {access.job.name}
              </li>
            ))}
          </ul>
        )}
        <div className="mt-3">
          <GrantJobAccessForm clientId={client.id} jobs={jobs} />
        </div>
      </section>
    </div>
  );
}
