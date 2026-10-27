import Link from "next/link";

import { SetupNotice } from "@/app/admin/setup-notice";
import { CreateModal } from "@/components/shell/CreateModal";
import { EmptyState } from "@/components/shell/EmptyState";
import { FunnelIcon, GearIcon, PeopleIcon, SearchIcon } from "@/components/shell/icons";
import { currentAppUserOrRedirect } from "@/lib/auth";
import { db } from "@/lib/db";

import { AddLeadOpportunityModal } from "./add-lead-opportunity-modal";
import { ImportLeadsForm } from "./import-leads-form";
import { LeadsGrid } from "./leads-grid";

export const dynamic = "force-dynamic";

function ageDays(createdAt: Date): number {
  return Math.max(0, Math.floor((Date.now() - createdAt.getTime()) / (1000 * 60 * 60 * 24)));
}

/**
 * Buildertrend-match "Lead Opportunities" list — a flat sortable-by-column table
 * (Title / Client Contact / Created Date / Lead Status / Age / Confidence / Est.
 * Revenue Min / Max), replacing the earlier ad-hoc Kanban-by-stage board. Stage is
 * still changeable inline (StageSelect) — Buildertrend's own list doesn't show a
 * separate pipeline column, but dropping the ability to change it would be a real
 * regression, not just a cosmetic one.
 */
const STAGE_TABS = [
  { key: "NEW", label: "New" },
  { key: "CONTACTED", label: "Contacted" },
  { key: "QUALIFIED", label: "Qualified" },
  { key: "PROPOSAL_SENT", label: "Quote Sent" },
  { key: "WON", label: "Won" },
  { key: "LOST", label: "Lost" },
  { key: "all", label: "All Leads" },
] as const;

export default async function LeadsPage({ searchParams }: PageProps<"/leads">) {
  const { stage: stageParam, q: queryParam } = await searchParams;
  const stage = STAGE_TABS.some((t) => t.key === stageParam) ? (stageParam as (typeof STAGE_TABS)[number]["key"]) : "all";
  const query = typeof queryParam === "string" ? queryParam.trim().toLowerCase() : "";
  let user;
  try {
    user = await currentAppUserOrRedirect();
  } catch (error) {
    return <SetupNotice detail={error instanceof Error ? error.message : String(error)} />;
  }

  const [leads, clients] = await Promise.all([
    db.lead.findMany({ where: { organizationId: user.organizationId }, orderBy: { createdAt: "desc" } }),
    db.client.findMany({ where: { organizationId: user.organizationId }, orderBy: { name: "asc" }, select: { id: true, name: true, email: true } }),
  ]);

  const filtered = leads.filter(
    (lead) =>
      (stage === "all" || lead.stage === stage) &&
      (!query || `${lead.title ?? ""} ${lead.name} ${lead.email ?? ""} ${lead.phone ?? ""}`.toLowerCase().includes(query)),
  );

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-3 p-4 sm:gap-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-[var(--bt-text)]">Lead Opportunities</h1>
        <div className="flex flex-wrap items-center gap-2">
          <CreateModal triggerLabel="Import Leads" title="Import leads from CSV" variant="secondary">
            <ImportLeadsForm />
          </CreateModal>
          <AddLeadOpportunityModal clients={clients} />
        </div>
      </div>

      <nav className="flex flex-wrap items-end justify-between gap-3 border-b" style={{ borderColor: "var(--bt-border)" }}>
        <div className="flex flex-wrap gap-1">
          {STAGE_TABS.map((t) => {
            const count = t.key === "all" ? leads.length : leads.filter((lead) => lead.stage === t.key).length;
            return (
              <Link
                key={t.key}
                href={`/leads${t.key === "all" ? "" : `?stage=${t.key}`}${query ? `${t.key === "all" ? "?" : "&"}q=${encodeURIComponent(query)}` : ""}`}
                className="-mb-px border-b-2 px-3 py-2.5 text-sm font-medium transition"
                style={{ borderColor: t.key === stage ? "var(--bt-primary)" : "transparent", color: t.key === stage ? "var(--bt-primary)" : "var(--bt-muted)" }}
              >
                {t.label} ({count})
              </Link>
            );
          })}
        </div>
        <div className="flex items-center gap-1 pb-2">
          <form action="/leads" className="flex items-center gap-1.5">
            {stage !== "all" ? <input type="hidden" name="stage" value={stage} /> : null}
            <label className="relative flex items-center">
              <SearchIcon className="pointer-events-none absolute left-2.5 h-3.5 w-3.5 text-[var(--bt-muted)]" />
              <input
                name="q"
                defaultValue={query}
                placeholder="Search leads"
                aria-label="Search leads"
                className="min-h-10 w-40 rounded border py-1.5 pl-8 pr-2 text-sm outline-none focus:border-[var(--bt-primary)] sm:min-h-0 sm:w-48"
                style={{ borderColor: "var(--bt-border)" }}
              />
            </label>
            <button
              type="submit"
              className="min-h-10 rounded border px-3 py-1.5 text-sm font-medium text-[var(--bt-text)] hover:bg-black/5 sm:min-h-0"
              style={{ borderColor: "var(--bt-border)" }}
            >
              Search
            </button>
          </form>
          <span
            className="inline-flex h-9 w-9 items-center justify-center rounded border text-[var(--bt-muted)]"
            style={{ borderColor: "var(--bt-border)" }}
            title="Filter (stage tabs above)"
            aria-hidden
          >
            <FunnelIcon className="h-4 w-4" />
          </span>
          <span
            className="inline-flex h-9 w-9 items-center justify-center rounded border text-[var(--bt-muted)]"
            style={{ borderColor: "var(--bt-border)" }}
            title="Column settings"
            aria-hidden
          >
            <GearIcon className="h-4 w-4" />
          </span>
        </div>
      </nav>

      {leads.length === 0 ? (
        <EmptyState
          icon={<PeopleIcon className="h-10 w-10" />}
          title="No lead opportunities yet"
          description="Add a lead to start tracking calls, meetings, and proposals — the same Sales pipeline as Buildertrend."
          action={<AddLeadOpportunityModal clients={clients} />}
        />
      ) : (
        <LeadsGrid
          rows={filtered.map((lead) => ({
            id: lead.id,
            title: lead.title ?? lead.name,
            converted: lead.convertedJobId !== null,
            contactName: lead.name,
            contactPhone: lead.phone,
            contactEmail: lead.email,
            source: lead.source,
            createdAt: lead.createdAt.toISOString(),
            stage: lead.stage,
            ageDays: ageDays(lead.createdAt),
            confidencePercent: lead.confidencePercent,
            revenueMinCents: lead.estimatedRevenueMinCents,
            revenueMaxCents: lead.estimatedRevenueMaxCents,
          }))}
        />
      )}
    </div>
  );
}
