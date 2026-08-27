import { AppShell } from "@/components/shell/AppShell";
import { sidebarJobsForOrg } from "@/components/shell/data";
import { SetupNotice } from "@/app/admin/setup-notice";
import { currentAppUserOrRedirect } from "@/lib/auth";
import { db } from "@/lib/db";

import { ConvertToJobButton } from "./convert-form";
import { LeadForm } from "./lead-form";
import { StageSelect } from "./stage-select";

export const dynamic = "force-dynamic";

const STAGES = [
  { value: "NEW", label: "New" },
  { value: "CONTACTED", label: "Contacted" },
  { value: "QUALIFIED", label: "Qualified" },
  { value: "PROPOSAL_SENT", label: "Proposal sent" },
  { value: "WON", label: "Won" },
  { value: "LOST", label: "Lost" },
] as const;

export default async function LeadsPage() {
  let user;
  try {
    user = await currentAppUserOrRedirect();
  } catch (error) {
    return <SetupNotice detail={error instanceof Error ? error.message : String(error)} />;
  }

  const [jobs, leads] = await Promise.all([
    sidebarJobsForOrg(user.organizationId),
    db.lead.findMany({ where: { organizationId: user.organizationId }, orderBy: { createdAt: "desc" } }),
  ]);

  return (
    <AppShell jobs={jobs}>
      <div className="mx-auto flex max-w-7xl flex-col gap-4 p-6">
        <h1 className="text-xl font-semibold text-[var(--bt-text)]">Sales</h1>

        <LeadForm />

        <div className="grid grid-cols-1 gap-3 overflow-x-auto sm:grid-cols-3 lg:grid-cols-6">
          {STAGES.map((stage) => {
            const stageLeads = leads.filter((lead) => lead.stage === stage.value);
            return (
              <div key={stage.value} className="flex min-w-0 flex-col gap-2 rounded-lg border bg-white p-2" style={{ borderColor: "var(--bt-border)" }}>
                <div className="flex items-center justify-between px-1 text-xs font-semibold uppercase tracking-wide text-[var(--bt-muted)]">
                  <span>{stage.label}</span>
                  <span>{stageLeads.length}</span>
                </div>
                <div className="flex flex-col gap-2">
                  {stageLeads.map((lead) => (
                    <div key={lead.id} className="rounded border p-2" style={{ borderColor: "var(--bt-border)" }}>
                      <div className="text-sm font-medium text-[var(--bt-text)]">{lead.name}</div>
                      {lead.email ? <div className="truncate text-xs text-[var(--bt-muted)]">{lead.email}</div> : null}
                      {lead.phone ? <div className="text-xs text-[var(--bt-muted)]">{lead.phone}</div> : null}
                      {lead.source ? <div className="text-xs text-[var(--bt-muted)]">via {lead.source}</div> : null}
                      <div className="mt-2">
                        <StageSelect leadId={lead.id} stage={lead.stage} />
                      </div>
                      {lead.convertedJobId === null ? (
                        <div className="mt-2">
                          <ConvertToJobButton leadId={lead.id} defaultName={lead.name} />
                        </div>
                      ) : (
                        <div className="mt-2 text-xs font-semibold text-[var(--bt-status-open-text)]">Converted</div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </AppShell>
  );
}
