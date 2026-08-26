import { contractTypePolicy } from "@/lib/contract-type";
import { currentAppUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { allowedNextStatusesForRole } from "@/lib/job-status";

import { SetupNotice } from "../setup-notice";
import { CreateJobForm, TransitionForm } from "./job-forms";

// Reads live data on every request — never prerendered at build time.
export const dynamic = "force-dynamic";

export default async function JobsPage() {
  let user;
  try {
    user = await currentAppUser();
  } catch (error) {
    return <SetupNotice detail={error instanceof Error ? error.message : String(error)} />;
  }

  if (!user) {
    return <SetupNotice detail="No organization found. Seed the database, then reload." />;
  }

  const jobs = await db.job.findMany({
    where: { organizationId: user.organizationId },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return (
    <>
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Jobs</h1>
        <p className="mt-1 text-sm text-black/60 dark:text-white/60">
          Signed in as {user.email} ({user.role}). Status changes run through the guarded state machine,
          so only legal transitions appear.
        </p>
      </div>

      <CreateJobForm />

      {jobs.length === 0 ? (
        <p className="text-sm text-black/60 dark:text-white/60">No jobs yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-3xl border-collapse text-sm">
            <thead>
              <tr className="border-b border-black/10 text-left text-xs uppercase tracking-wide text-black/50 dark:border-white/15 dark:text-white/50">
                <th className="py-2 pr-4 font-medium">Job</th>
                <th className="py-2 pr-4 font-medium">Prefix</th>
                <th className="py-2 pr-4 font-medium">Contract</th>
                <th className="py-2 pr-4 font-medium">Status</th>
                <th className="py-2 pr-4 font-medium">Transitions</th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((job) => (
                <tr key={job.id} className="border-b border-black/5 align-top dark:border-white/10">
                  <td className="py-3 pr-4">
                    <div className="font-medium">{job.name}</div>
                    {job.addressLine1 ? (
                      <div className="text-xs text-black/50 dark:text-white/50">
                        {job.addressLine1}
                        {job.city ? `, ${job.city}` : ""}
                      </div>
                    ) : null}
                  </td>
                  <td className="py-3 pr-4 font-mono text-xs">{job.prefix ?? "—"}</td>
                  <td className="py-3 pr-4">{contractTypePolicy(job.contractType).label}</td>
                  <td className="py-3 pr-4">
                    <span className="rounded bg-black/5 px-2 py-1 font-mono text-xs dark:bg-white/10">
                      {job.status}
                    </span>
                  </td>
                  <td className="py-3 pr-4">
                    <TransitionForm jobId={job.id} allowed={allowedNextStatusesForRole(job.status, user.role)} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
