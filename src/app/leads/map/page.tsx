import { SetupNotice } from "@/app/admin/setup-notice";
import { EmptyState } from "@/components/shell/EmptyState";
import { MapPinIcon } from "@/components/shell/icons";
import { currentAppUser } from "@/lib/auth";
import { db } from "@/lib/db";

import { LeadMapClient } from "./lead-map-client";

export const dynamic = "force-dynamic";

/**
 * Lead Map — OpenStreetMap tiles (Leaflet CDN) + Nominatim geocoding for pins.
 * Keeps the address list underneath for leads Nominatim can't place.
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
    take: 200,
  });

  const pins = leads.map((lead) => ({
    id: lead.id,
    label: lead.title ?? lead.name,
    stage: lead.stage,
    address: [lead.addressLine1, lead.city, lead.state, lead.postalCode].filter(Boolean).join(", "),
    href: `/leads/${lead.id}`,
  }));

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-3 p-4 sm:gap-4 sm:p-6">
      <div>
        <h1 className="text-xl font-semibold text-[var(--bt-text)]">Lead Map</h1>
        <p className="mt-0.5 text-sm text-[var(--bt-muted)]">Leads with addresses on OpenStreetMap tiles.</p>
      </div>

      {pins.length === 0 ? (
        <EmptyState
          icon={<MapPinIcon className="h-10 w-10" />}
          title="No leads to map"
          description="Add a lead opportunity with an address and it will show up here."
        />
      ) : (
        <LeadMapClient pins={pins} />
      )}
    </div>
  );
}
