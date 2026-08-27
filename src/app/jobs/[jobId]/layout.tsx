import { notFound } from "next/navigation";

import { AppShell } from "@/components/shell/AppShell";
import { sidebarJobsForOrg } from "@/components/shell/data";
import { SetupNotice } from "@/app/admin/setup-notice";
import { currentAppUserOrRedirect } from "@/lib/auth";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

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

  const jobs = await sidebarJobsForOrg(user.organizationId);

  return (
    <AppShell jobs={jobs} activeJobId={job.id}>
      {children}
    </AppShell>
  );
}
