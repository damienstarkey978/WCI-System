import Link from "next/link";
import { notFound } from "next/navigation";

import { SetupNotice } from "@/app/admin/setup-notice";
import { PageHeader } from "@/components/shell/PageHeader";
import { currentAppUser } from "@/lib/auth";
import { docsForPack } from "@/lib/permitting/docs";
import {
  getJobPermitting,
  hasBuildingPermitDocs,
  JobNotFoundError,
  tradeLabel,
} from "@/lib/permitting/service";

import { setBuildingPermitDocsCreatedAction, setNocNtboAction } from "../actions";
import { PermitDocsForm } from "./permit-docs-form";

export const dynamic = "force-dynamic";

export default async function PermitDocsPage({
  params,
  searchParams,
}: PageProps<"/jobs/[jobId]/permitting/docs">) {
  const { jobId } = await params;
  const query = await searchParams;

  let user;
  try {
    user = await currentAppUser();
  } catch (error) {
    return <SetupNotice detail={error instanceof Error ? error.message : String(error)} />;
  }
  if (!user) {
    return <SetupNotice detail="No organization found. Seed the database, then reload." />;
  }

  let job;
  try {
    job = await getJobPermitting(user.organizationId, jobId);
  } catch (error) {
    if (error instanceof JobNotFoundError) notFound();
    throw error;
  }

  const waterRaw = typeof query.water === "string" ? query.water : "UNKNOWN";
  const waterService =
    waterRaw === "CITY" || waterRaw === "SEPTIC" || waterRaw === "UNKNOWN" ? waterRaw : "UNKNOWN";
  const bathroomAdd = query.bathroom === "1" || query.bathroom === "true";

  const pack = docsForPack({
    municipality: "DUVAL_JAX",
    waterService,
    bathroomAdd,
    nocOnFile: job.nocOnFile,
    ntboFiled: job.ntboFiled,
  });
  const included = pack.filter((d) => d.included);
  const docsCreated = hasBuildingPermitDocs(job.buildingPermitDocsCreatedAt);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4 p-4 sm:p-6">
      <PageHeader jobName={job.name} title="Building permit docs" />
      <p className="-mt-2 text-sm text-[var(--bt-muted)]">
        Duval / City of Jacksonville first. NOC, NTBO, and the building application are printable
        WCI worksheets (Print / Save as PDF). Product approvals and JEA/health letters stay external
        until those templates / Permit Rockstar login land.
      </p>
      <p className="text-xs text-[var(--bt-muted)]">
        <Link href={`/jobs/${job.id}/permitting`} className="font-medium text-[var(--bt-primary)] hover:underline">
          ← Back to Permitting
        </Link>
      </p>

      <section
        className="rounded-lg border bg-[var(--bt-panel-bg)] p-3 sm:p-4"
        style={{ borderColor: "var(--bt-border)" }}
      >
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold text-[var(--bt-text)]">Pack status</h2>
            <p className="mt-1 text-xs text-[var(--bt-muted)]">
              Marking docs created updates the Permitting header (stops showing “Docs missing”).
            </p>
          </div>
          <form action={setBuildingPermitDocsCreatedAction}>
            <input type="hidden" name="jobId" value={job.id} />
            <input type="hidden" name="created" value={docsCreated ? "false" : "true"} />
            <button
              type="submit"
              className="rounded px-3 py-1.5 text-xs font-semibold"
              style={{
                background: docsCreated ? "transparent" : "var(--bt-primary)",
                color: docsCreated ? "var(--bt-text)" : "var(--bt-on-primary)",
                border: "1px solid var(--bt-border)",
              }}
            >
              {docsCreated ? "Clear docs created" : "Mark docs created"}
            </button>
          </form>
        </div>
        <p className="mt-2 text-sm font-medium text-[var(--bt-text)]">
          {docsCreated ? "Docs created" : "Docs missing"}
          {docsCreated && job.buildingPermitDocsCreatedAt
            ? ` · ${job.buildingPermitDocsCreatedAt.toLocaleDateString()}`
            : ""}
        </p>
      </section>

      <section
        className="rounded-lg border bg-[var(--bt-panel-bg)] p-3 sm:p-4"
        style={{ borderColor: "var(--bt-border)" }}
      >
        <h2 className="text-sm font-semibold text-[var(--bt-text)]">Job &amp; municipality</h2>
        <dl className="mt-2 grid gap-1 text-xs text-[var(--bt-muted)] sm:grid-cols-2">
          <div>
            <dt className="font-medium">Job</dt>
            <dd className="text-[var(--bt-text)]">{job.name}</dd>
          </div>
          <div>
            <dt className="font-medium">Municipality</dt>
            <dd className="text-[var(--bt-text)]">Duval / City of Jacksonville</dd>
          </div>
          <div>
            <dt className="font-medium">NOC</dt>
            <dd className="flex items-center gap-2 text-[var(--bt-text)]">
              {job.nocOnFile ? "On file" : "Missing"}
              <form action={setNocNtboAction}>
                <input type="hidden" name="jobId" value={job.id} />
                <input type="hidden" name="field" value="nocOnFile" />
                <input type="hidden" name="value" value={job.nocOnFile ? "false" : "true"} />
                <button type="submit" className="text-[10px] font-semibold text-[var(--bt-primary)] hover:underline">
                  Toggle
                </button>
              </form>
            </dd>
          </div>
          <div>
            <dt className="font-medium">NTBO</dt>
            <dd className="flex items-center gap-2 text-[var(--bt-text)]">
              {job.ntboFiled ? "Filed" : "Not filed"}
              <form action={setNocNtboAction}>
                <input type="hidden" name="jobId" value={job.id} />
                <input type="hidden" name="field" value="ntboFiled" />
                <input type="hidden" name="value" value={job.ntboFiled ? "false" : "true"} />
                <button type="submit" className="text-[10px] font-semibold text-[var(--bt-primary)] hover:underline">
                  Toggle
                </button>
              </form>
            </dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="font-medium">Permits on this job</dt>
            <dd className="text-[var(--bt-text)]">
              {job.permits.length === 0
                ? "None yet — add on Permitting first."
                : job.permits.map((p) => tradeLabel(p.trade)).join(", ")}
            </dd>
          </div>
        </dl>
      </section>

      <section
        className="rounded-lg border bg-[var(--bt-panel-bg)] p-3 sm:p-4"
        style={{ borderColor: "var(--bt-border)" }}
      >
        <h2 className="text-sm font-semibold text-[var(--bt-text)]">Scope branches</h2>
        <p className="mt-1 text-xs text-[var(--bt-muted)]">
          Bathroom add → JEA letter on city water. Septic → health department letter path.
        </p>
        <div className="mt-3">
          <PermitDocsForm jobId={job.id} waterService={waterService} bathroomAdd={bathroomAdd} />
        </div>
      </section>

      <section
        className="rounded-lg border bg-[var(--bt-panel-bg)] p-3 sm:p-4"
        style={{ borderColor: "var(--bt-border)" }}
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-[var(--bt-text)]">Document pack</h2>
          <Link
            href={`/jobs/${job.id}/permitting/docs/print?water=${waterService}${bathroomAdd ? "&bathroom=1" : ""}`}
            className="rounded px-3 py-1.5 text-xs font-semibold text-[var(--bt-on-primary)]"
            style={{ background: "var(--bt-primary)" }}
          >
            Print pack ({included.filter((d) => d.status === "ready").length} ready / {included.length} in pack)
          </Link>
        </div>
        <ul className="mt-3 divide-y" style={{ borderColor: "var(--bt-border)" }}>
          {pack.map((doc) => (
            <li
              key={doc.kind}
              className="flex flex-col gap-1 py-2.5 first:pt-0 last:pb-0 sm:flex-row sm:items-start sm:justify-between"
              style={{ borderColor: "var(--bt-border)" }}
            >
              <div className="min-w-0">
                <p className="text-sm font-medium text-[var(--bt-text)]">
                  {doc.included ? "✓ " : "○ "}
                  {doc.title}
                  {doc.status === "stub" ? (
                    <span className="ml-1 text-[10px] font-normal text-[var(--bt-muted)]">(stub)</span>
                  ) : null}
                </p>
                <p className="text-xs text-[var(--bt-muted)]">{doc.description}</p>
                <p className="mt-0.5 text-[11px] text-[var(--bt-muted)]">{doc.reason}</p>
              </div>
              <span
                className="shrink-0 rounded px-2 py-0.5 text-[10px] font-semibold"
                style={{
                  background: doc.included
                    ? "color-mix(in srgb, var(--bt-status-open-bg) 80%, transparent)"
                    : "transparent",
                  color: doc.included ? "var(--bt-status-open-text)" : "var(--bt-muted)",
                  border: "1px solid var(--bt-border)",
                }}
              >
                {doc.included ? "In pack" : "Skipped"}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
