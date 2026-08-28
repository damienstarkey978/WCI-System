import { notFound } from "next/navigation";

import { SetupNotice } from "@/app/admin/setup-notice";
import { StaffShell } from "@/components/shell/StaffShell";
import { currentAppUserOrRedirect } from "@/lib/auth";
import { db } from "@/lib/db";
import { getJobAccessLevel } from "@/lib/job-access";

export const dynamic = "force-dynamic";

/**
 * The single choke point every job subpage renders through — the right place
 * to enforce the (User x Job) access grant (src/lib/job-access.ts) once, for
 * every nested route, rather than repeating the check in each page.
 */
export default async function JobLayout({ children, params }: LayoutProps<"/jobs/[jobId]">) {
  const { jobId } = await params;

  let user;
  try {
    user = await currentAppUserOrRedirect();
  } catch (error) {
    return <SetupNotice detail={error instanceof Error ? error.message : String(error)} />;
  }

  const job = await db.job.findFirst({ where: { id: jobId, organizationId: user.organizationId } });
  if (!job) notFound();

  const access = await getJobAccessLevel(user, job.id);
  if (!access.allowed) {
    return (
      <StaffShell activeJobId={job.id}>
        <div className="mx-auto max-w-2xl p-6">
          <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
            You don&apos;t have access to this job yet. Ask an admin to grant it from your staff profile.
          </div>
        </div>
      </StaffShell>
    );
  }

  return <StaffShell activeJobId={job.id}>{children}</StaffShell>;
}
