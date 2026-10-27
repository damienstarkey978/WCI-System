import Link from "next/link";
import { notFound } from "next/navigation";

import { SetupNotice } from "@/app/admin/setup-notice";
import { PageHeader } from "@/components/shell/PageHeader";
import { currentAppUser } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  catalogInspectionNamesForTrade,
  listPermittingJobs,
  tradeLabel,
} from "@/lib/permitting/service";

import {
  removePermitInspectionAction,
  setInspectionCompletedAction,
  setNocNtboAction,
  setPermitPulledAction,
} from "./actions";
import { AddInspectionForm } from "./add-inspection-form";
import { AssignVendorForm } from "./assign-vendor-form";
import { PermitReminderButton } from "./permit-reminder-button";

export const dynamic = "force-dynamic";

export default async function PermittingPage({ params }: PageProps<"/jobs/[jobId]/permitting">) {
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

  const currentJob = await db.job.findFirst({ where: { id: jobId, organizationId: user.organizationId } });
  if (!currentJob) notFound();

  const [jobs, vendors] = await Promise.all([
    listPermittingJobs(user.organizationId),
    db.vendor.findMany({
      where: { organizationId: user.organizationId },
      orderBy: { name: "asc" },
      select: { id: true, name: true, email: true, tradeType: true },
    }),
  ]);

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-4 p-4 sm:p-6">
      <PageHeader jobName={currentJob.name} title="Permitting" />
      <p className="-mt-2 text-sm text-[var(--bt-muted)]">
        All current jobs: permit numbers, MEP pull status, inspections, NOC, and NTBO.
      </p>

      <div className="flex flex-col gap-4">
        {jobs.length === 0 ? (
          <p className="rounded-lg border bg-[var(--bt-panel-bg)] px-4 py-10 text-center text-sm text-[var(--bt-muted)]" style={{ borderColor: "var(--bt-border)" }}>
            No open jobs yet.
          </p>
        ) : (
          jobs.map((job) => {
            const isCurrent = job.id === currentJob.id;
            const building = job.permits.find((p) => p.trade === "BUILDING");
            return (
              <article
                key={job.id}
                id={`job-${job.id}`}
                className="rounded-lg border bg-[var(--bt-panel-bg)] p-3 sm:p-4"
                style={{
                  borderColor: isCurrent ? "var(--bt-primary)" : "var(--bt-border)",
                  boxShadow: isCurrent ? "0 0 0 1px var(--bt-primary)" : undefined,
                }}
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <Link href={`/jobs/${job.id}/permitting`} className="text-base font-semibold text-[var(--bt-primary)] hover:underline">
                      {job.name}
                    </Link>
                    <p className="mt-0.5 text-xs text-[var(--bt-muted)]">
                      {job.status.replaceAll("_", " ")}
                      {job.permitNumber ? ` · Job permit # ${job.permitNumber}` : ""}
                      {building?.permitNumber && building.permitNumber !== job.permitNumber
                        ? ` · Building # ${building.permitNumber}`
                        : ""}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2 text-xs">
                    <form action={setNocNtboAction}>
                      <input type="hidden" name="jobId" value={job.id} />
                      <input type="hidden" name="field" value="nocOnFile" />
                      <input type="hidden" name="value" value={job.nocOnFile ? "false" : "true"} />
                      <button
                        type="submit"
                        className="rounded-full px-2.5 py-1 font-semibold"
                        style={{
                          background: job.nocOnFile
                            ? "color-mix(in srgb, var(--bt-status-open-bg) 80%, transparent)"
                            : "color-mix(in srgb, var(--bt-hazard) 18%, transparent)",
                          color: job.nocOnFile ? "var(--bt-status-open-text)" : "var(--bt-hazard)",
                        }}
                      >
                        NOC {job.nocOnFile ? "on file" : "missing"}
                      </button>
                    </form>
                    <form action={setNocNtboAction}>
                      <input type="hidden" name="jobId" value={job.id} />
                      <input type="hidden" name="field" value="ntboFiled" />
                      <input type="hidden" name="value" value={job.ntboFiled ? "false" : "true"} />
                      <button
                        type="submit"
                        className="rounded-full px-2.5 py-1 font-semibold"
                        style={{
                          background: job.ntboFiled
                            ? "color-mix(in srgb, var(--bt-status-open-bg) 80%, transparent)"
                            : "color-mix(in srgb, var(--bt-hazard) 18%, transparent)",
                          color: job.ntboFiled ? "var(--bt-status-open-text)" : "var(--bt-hazard)",
                        }}
                      >
                        NTBO {job.ntboFiled ? "filed" : "not filed"}
                      </button>
                    </form>
                  </div>
                </div>

                <div className="mt-3 grid gap-3">
                  {job.permits.map((permit) => {
                    const done = permit.inspections.filter((i) => i.completedAt).length;
                    const total = permit.inspections.length;
                    return (
                      <div key={permit.id} className="rounded border p-3" style={{ borderColor: "var(--bt-border)" }}>
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                          <div>
                            <h3 className="text-sm font-semibold text-[var(--bt-text)]">{tradeLabel(permit.trade)} permit</h3>
                            <p className="text-xs text-[var(--bt-muted)]">
                              {permit.permitNumber ? `# ${permit.permitNumber}` : "No permit number yet"}
                              {permit.vendor ? ` · ${permit.vendor.name}` : ""}
                            </p>
                          </div>
                          <div className="flex flex-col gap-2 sm:items-end">
                            <form action={setPermitPulledAction} className="flex items-center gap-2">
                              <input type="hidden" name="jobId" value={job.id} />
                              <input type="hidden" name="permitId" value={permit.id} />
                              <input type="hidden" name="pulled" value={permit.pulled ? "false" : "true"} />
                              <button
                                type="submit"
                                className="rounded px-2.5 py-1 text-xs font-semibold"
                                style={{
                                  background: permit.pulled ? "var(--bt-status-open-bg)" : "transparent",
                                  color: permit.pulled ? "var(--bt-status-open-text)" : "var(--bt-text)",
                                  border: "1px solid var(--bt-border)",
                                }}
                              >
                                {permit.pulled ? "Pulled" : "Not pulled"}
                              </button>
                            </form>
                            {!permit.pulled ? (
                              <PermitReminderButton
                                jobId={job.id}
                                permitId={permit.id}
                                disabled={!permit.vendor?.email}
                              />
                            ) : null}
                          </div>
                        </div>

                        <AssignVendorForm
                          jobId={job.id}
                          permitId={permit.id}
                          vendorId={permit.vendorId}
                          vendors={vendors}
                        />

                        <div className="mt-3">
                          <p className="mb-1.5 text-xs font-medium text-[var(--bt-muted)]">
                            Inspections required for this job{total > 0 ? ` · ${done}/${total} complete` : ""}
                          </p>
                          {total === 0 ? (
                            <p className="text-xs text-[var(--bt-muted)]">
                              None yet — add only the inspections this job needs (folders appear under Inspection Pictures).
                            </p>
                          ) : (
                            <ul className="grid gap-1.5 sm:grid-cols-2">
                              {permit.inspections.map((inspection) => {
                                const doneFlag = inspection.completedAt != null;
                                return (
                                  <li
                                    key={inspection.id}
                                    className="flex items-stretch gap-1 rounded border"
                                    style={{ borderColor: "var(--bt-border)" }}
                                  >
                                    <form action={setInspectionCompletedAction} className="min-w-0 flex-1">
                                      <input type="hidden" name="jobId" value={job.id} />
                                      <input type="hidden" name="inspectionId" value={inspection.id} />
                                      <input type="hidden" name="completed" value={doneFlag ? "false" : "true"} />
                                      <button
                                        type="submit"
                                        className="flex w-full items-center gap-2 px-2.5 py-2 text-left text-xs sm:py-1.5"
                                      >
                                        <span
                                          aria-hidden
                                          className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded border text-[10px]"
                                          style={{
                                            borderColor: "var(--bt-border)",
                                            background: doneFlag ? "var(--bt-primary)" : "transparent",
                                            color: doneFlag ? "var(--bt-on-primary)" : "transparent",
                                          }}
                                        >
                                          ✓
                                        </span>
                                        <span className={doneFlag ? "text-[var(--bt-muted)] line-through" : "text-[var(--bt-text)]"}>
                                          {inspection.name}
                                        </span>
                                      </button>
                                    </form>
                                    <form action={removePermitInspectionAction} className="shrink-0 self-center pr-1">
                                      <input type="hidden" name="jobId" value={job.id} />
                                      <input type="hidden" name="inspectionId" value={inspection.id} />
                                      <button
                                        type="submit"
                                        aria-label={`Remove ${inspection.name} from this job`}
                                        className="rounded px-2 py-1 text-[10px] font-semibold text-[var(--bt-muted)] hover:text-red-600"
                                      >
                                        Remove
                                      </button>
                                    </form>
                                  </li>
                                );
                              })}
                            </ul>
                          )}
                          <AddInspectionForm
                            jobId={job.id}
                            permitId={permit.id}
                            catalogNames={catalogInspectionNamesForTrade(permit.trade)}
                            existingNames={permit.inspections.map((i) => i.name)}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </article>
            );
          })
        )}
      </div>
    </div>
  );
}
