import Link from "next/link";

import { SetupNotice } from "@/app/admin/setup-notice";
import { currentAppUser } from "@/lib/auth";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

const STAGE_STYLE: Record<string, { bg: string; text: string }> = {
  NEW: { bg: "#e5e7eb", text: "#374151" },
  CONTACTED: { bg: "color-mix(in srgb, var(--bt-primary) 14%, transparent)", text: "var(--bt-primary)" },
  QUALIFIED: { bg: "color-mix(in srgb, var(--bt-hazard) 14%, transparent)", text: "var(--bt-hazard)" },
  PROPOSAL_SENT: { bg: "color-mix(in srgb, var(--bt-primary) 14%, transparent)", text: "var(--bt-primary)" },
  WON: { bg: "var(--bt-status-open-bg)", text: "var(--bt-status-open-text)" },
  LOST: { bg: "color-mix(in srgb, var(--bt-danger) 14%, transparent)", text: "var(--bt-danger)" },
};

/**
 * "Lead Map" (Buildertrend screenshot gap-analysis pass) — same honest stand-in as
 * /jobs/map: no geocoding/tiles provider is configured, so this lists every lead
 * with an address and links out to Google's plain search URL instead of faking map
 * pins. /leads/layout.tsx already wraps every page under here in StaffShell.
 */
export default async function LeadMapPage() {
  let user;
  try {
    user = await currentAppUser();
  } catch (error) {
    return <SetupNotice detail={error instanceof Error ? error.message : String(error)} />;
  }
  if (!user) {
    return <SetupNotice detail="No organization found. Seed the database, then reload." />;
  }

  const leads = await db.lead.findMany({
    where: { organizationId: user.organizationId },
    orderBy: { createdAt: "desc" },
    select: { id: true, title: true, name: true, stage: true, addressLine1: true, city: true, state: true, postalCode: true },
  });

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4 p-6">
      <h1 className="text-xl font-semibold text-[var(--bt-text)]">Lead Map</h1>

      <div className="overflow-hidden rounded-lg border bg-[var(--bt-panel-bg)]" style={{ borderColor: "var(--bt-border)" }}>
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b text-xs font-semibold uppercase tracking-wide text-[var(--bt-muted)]" style={{ borderColor: "var(--bt-border)" }}>
              <th className="px-4 py-3">Lead</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Address</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {leads.map((lead) => {
              const address = [lead.addressLine1, lead.city, lead.state, lead.postalCode].filter(Boolean).join(", ");
              const style = STAGE_STYLE[lead.stage] ?? STAGE_STYLE.NEW;
              return (
                <tr key={lead.id} className="border-b last:border-0" style={{ borderColor: "var(--bt-border)" }}>
                  <td className="px-4 py-3 font-medium text-[var(--bt-text)]">
                    <Link href={`/leads/${lead.id}`} className="hover:underline">
                      {lead.title ?? lead.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <span className="rounded px-1.5 py-0.5 text-xs font-semibold" style={{ background: style.bg, color: style.text }}>
                      {lead.stage}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-[var(--bt-text)]">{address || "—"}</td>
                  <td className="px-4 py-3 text-right">
                    {address ? (
                      <a
                        href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs font-medium text-[var(--bt-primary)] hover:underline"
                      >
                        View on map →
                      </a>
                    ) : null}
                  </td>
                </tr>
              );
            })}
            {leads.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-[var(--bt-muted)]">
                  No leads yet.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
