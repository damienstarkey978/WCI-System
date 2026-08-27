import { notFound } from "next/navigation";

import { SetupNotice } from "@/app/admin/setup-notice";
import { EmptyState } from "@/components/shell/EmptyState";
import { currentAppUser } from "@/lib/auth";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function PlansAndSpecsPage({ params }: PageProps<"/jobs/[jobId]/plans-and-specs">) {
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

  const job = await db.job.findFirst({ where: { id: jobId, organizationId: user.organizationId } });
  if (!job) notFound();

  const specifications = await db.specification.findMany({
    where: { jobId: job.id },
    orderBy: { createdAt: "desc" },
    include: { sections: { orderBy: { sortOrder: "asc" } } },
  });

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4 p-6">
      <h1 className="text-xl font-semibold text-[var(--bt-text)]">Plans and specs — {job.name}</h1>

      {specifications.length === 0 ? (
        <EmptyState title="No specifications yet" description="Specification books generated for this job will appear here." />
      ) : (
        <div className="flex flex-col gap-4">
          {specifications.map((spec) => (
            <section key={spec.id} className="rounded-lg border bg-white" style={{ borderColor: "var(--bt-border)" }}>
              <header className="flex items-center justify-between border-b px-4 py-3" style={{ borderColor: "var(--bt-border)" }}>
                <h2 className="text-sm font-semibold text-[var(--bt-text)]">{spec.title}</h2>
                <span className="text-xs text-[var(--bt-muted)]">{spec.sections.length} sections</span>
              </header>
              <div className="divide-y" style={{ borderColor: "var(--bt-border)" }}>
                {spec.sections.map((section) => (
                  <div key={section.id} className="px-4 py-3">
                    <div className="text-sm font-medium text-[var(--bt-text)]">{section.title}</div>
                    <p className="mt-1 whitespace-pre-wrap text-sm text-[var(--bt-muted)]">{section.body}</p>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
