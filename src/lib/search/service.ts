/**
 * Cross-entity search for the staff app's top-nav search box. Not exposed on
 * /api/v1 (machine-facing) — this backs /api/staff/search, authenticated by
 * the caller's own Clerk session, same pattern as
 * /api/staff/files/batch-import.
 */

import { UserRole } from "@/generated/prisma/enums";
import { db } from "@/lib/db";

export interface SearchResultItem {
  readonly id: string;
  readonly label: string;
  readonly sublabel?: string;
  readonly href: string;
}

export interface SearchResults {
  readonly jobs: readonly SearchResultItem[];
  readonly clients: readonly SearchResultItem[];
  readonly vendors: readonly SearchResultItem[];
  readonly leads: readonly SearchResultItem[];
}

const MAX_PER_GROUP = 5;
const EMPTY_RESULTS: SearchResults = { jobs: [], clients: [], vendors: [], leads: [] };

/**
 * FIELD's role is job-scoped only (src/lib/job-access.ts) — it searches just
 * the jobs that role is actually granted, and never sees clients, vendors, or
 * leads at all. ADMIN/PM/OFFICE keep their existing org-wide visibility.
 */
export async function searchStaffApp(
  organizationId: string,
  user: { readonly id: string; readonly role: UserRole },
  query: string,
): Promise<SearchResults> {
  const q = query.trim();
  if (q.length < 2) return EMPTY_RESULTS;

  const jobs = await db.job.findMany({
    where: {
      organizationId,
      isTemplate: false,
      ...(user.role === UserRole.FIELD ? { accessGrants: { some: { userId: user.id } } } : {}),
      OR: [{ name: { contains: q, mode: "insensitive" } }, { prefix: { contains: q, mode: "insensitive" } }],
    },
    take: MAX_PER_GROUP,
    select: { id: true, name: true, prefix: true },
  });
  const jobResults = jobs.map((job) => ({ id: job.id, label: job.name, sublabel: job.prefix ?? undefined, href: `/jobs/${job.id}` }));

  if (user.role === UserRole.FIELD) {
    return { ...EMPTY_RESULTS, jobs: jobResults };
  }

  const [clients, vendors, leads] = await Promise.all([
    db.client.findMany({
      where: { organizationId, OR: [{ name: { contains: q, mode: "insensitive" } }, { email: { contains: q, mode: "insensitive" } }] },
      take: MAX_PER_GROUP,
      select: { id: true, name: true, email: true },
    }),
    db.vendor.findMany({
      where: { organizationId, OR: [{ name: { contains: q, mode: "insensitive" } }, { email: { contains: q, mode: "insensitive" } }] },
      take: MAX_PER_GROUP,
      select: { id: true, name: true, email: true },
    }),
    db.lead.findMany({
      where: { organizationId, OR: [{ name: { contains: q, mode: "insensitive" } }, { email: { contains: q, mode: "insensitive" } }] },
      take: MAX_PER_GROUP,
      select: { id: true, name: true, email: true },
    }),
  ]);

  return {
    jobs: jobResults,
    clients: clients.map((client) => ({ id: client.id, label: client.name, sublabel: client.email, href: `/clients/${client.id}` })),
    vendors: vendors.map((vendor) => ({ id: vendor.id, label: vendor.name, sublabel: vendor.email, href: `/vendors/${vendor.id}` })),
    leads: leads.map((lead) => ({ id: lead.id, label: lead.name, sublabel: lead.email ?? undefined, href: `/leads/${lead.id}` })),
  };
}
