import Link from "next/link";
import { notFound } from "next/navigation";

import { SetupNotice } from "@/app/admin/setup-notice";
import { currentAppUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { docsForPack } from "@/lib/permitting/docs";
import {
  generatePrintablePack,
  PRINTABLE_PERMIT_DOC_KINDS,
} from "@/lib/permitting/generate-docs";
import { getJobPermitting, JobNotFoundError, tradeLabel } from "@/lib/permitting/service";

import { PrintButton } from "./print-button";

export const dynamic = "force-dynamic";

export default async function PermitDocsPrintPage({
  params,
  searchParams,
}: PageProps<"/jobs/[jobId]/permitting/docs/print">) {
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
  const printableKinds = pack
    .filter((d) => d.included && PRINTABLE_PERMIT_DOC_KINDS.includes(d.kind))
    .map((d) => d.kind);

  const [jobDetails, org] = await Promise.all([
    db.job.findFirst({
      where: { id: job.id, organizationId: user.organizationId },
      select: {
        addressLine1: true,
        city: true,
        state: true,
        postalCode: true,
        sqft: true,
        lotInfo: true,
      },
    }),
    db.organization.findUniqueOrThrow({
      where: { id: user.organizationId },
      select: {
        name: true,
        addressLine1: true,
        city: true,
        state: true,
        postalCode: true,
        contactPhone: true,
        contactEmail: true,
      },
    }),
  ]);

  const pages = generatePrintablePack(printableKinds, {
    jobName: job.name,
    addressLine1: jobDetails?.addressLine1 ?? null,
    city: jobDetails?.city ?? null,
    state: jobDetails?.state ?? null,
    postalCode: jobDetails?.postalCode ?? null,
    permitNumber: job.permitNumber,
    sqft: jobDetails?.sqft ?? null,
    lotInfo: jobDetails?.lotInfo ?? null,
    nocOnFile: job.nocOnFile,
    ntboFiled: job.ntboFiled,
    orgName: org.name,
    orgAddressLine1: org.addressLine1,
    orgCity: org.city,
    orgState: org.state,
    orgPostalCode: org.postalCode,
    orgPhone: org.contactPhone,
    orgEmail: org.contactEmail,
    waterService,
    bathroomAdd,
    permitTrades: job.permits.map((p) => tradeLabel(p.trade)),
  });

  return (
    <div className="min-h-screen bg-[#f3f4f6] px-3 py-6 sm:px-6 sm:py-10 print:bg-white print:px-0 print:py-0">
      <style>{`
        @media print {
          .no-print { display: none !important; }
          .permit-sheet { break-after: page; box-shadow: none !important; border: none !important; }
          .permit-sheet:last-child { break-after: auto; }
        }
      `}</style>

      <div className="no-print mx-auto mb-4 flex max-w-3xl flex-wrap items-center justify-between gap-2">
        <Link
          href={`/jobs/${job.id}/permitting/docs?water=${waterService}${bathroomAdd ? "&bathroom=1" : ""}`}
          className="text-sm font-medium text-[var(--bt-primary)] hover:underline"
        >
          ← Back to doc checklist
        </Link>
        <PrintButton />
      </div>

      {pages.length === 0 ? (
        <div className="mx-auto max-w-3xl rounded-lg border bg-white p-6 text-sm text-[var(--bt-muted)]">
          No printable worksheets in this pack yet. Product approvals and JEA/health letters still need
          external templates.
        </div>
      ) : (
        <div className="mx-auto flex max-w-3xl flex-col gap-6">
          {pages.map((doc) => (
            <article
              key={doc.kind}
              className="permit-sheet rounded-lg border bg-white p-6 shadow-sm sm:p-8"
              style={{ borderColor: "#e5e7eb" }}
            >
              <header className="border-b pb-4" style={{ borderColor: "#e5e7eb" }}>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{org.name}</p>
                <h1 className="mt-1 text-xl font-semibold text-slate-900">{doc.title}</h1>
                <p className="mt-1 text-sm text-slate-600">{doc.subtitle}</p>
              </header>

              <dl className="mt-4 grid gap-3 sm:grid-cols-2">
                {doc.fields.map((field) => (
                  <div key={field.label} className="min-w-0">
                    <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{field.label}</dt>
                    <dd className="mt-0.5 text-sm text-slate-900">{field.value}</dd>
                  </div>
                ))}
              </dl>

              <section className="mt-5">
                <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Before filing</h2>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-700">
                  {doc.checklist.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </section>

              <p className="mt-5 text-[11px] leading-relaxed text-slate-500">{doc.legalNote}</p>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
