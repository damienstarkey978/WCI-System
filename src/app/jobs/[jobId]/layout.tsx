import { notFound } from "next/navigation";

import { SetupNotice } from "@/app/admin/setup-notice";
import { StaffShell } from "@/components/shell/StaffShell";
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

  return <StaffShell activeJobId={job.id}>{children}</StaffShell>;
}
