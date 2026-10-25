import Link from "next/link";

import { SetupNotice } from "@/app/admin/setup-notice";
import { DirectoryHeader, FilterMenu, Pagination } from "@/components/directory/directory-controls";
import { ActivationPill, DirectoryTable, SearchForm, type DirectoryColumn } from "@/components/directory/directory-table";
import { currentAppUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { activationOf, activationWhere } from "@/lib/directory/activation";
import { directoryHref, parseDirectoryParams, type ActivationFilter } from "@/lib/directory/params";
import { formatDate } from "@/lib/format";

import { CreateVendorForm } from "./create-vendor-form";
import { ImportVendorsForm } from "./import-vendors-form";

export const dynamic = "force-dynamic";

const BASE_PATH = "/vendors";
const STATUSES: readonly ActivationFilter[] = ["active", "pending", "inactive", "no-email"];
const STATUS_LABELS: Record<ActivationFilter, string> = { active: "Active", pending: "Pending", inactive: "Inactive", "no-email": "No Email" };

type VendorRow = Awaited<ReturnType<typeof loadVendors>>["vendors"][number];

async function loadVendors(organizationId: string, params: ReturnType<typeof parseDirectoryParams>) {
  const search = params.query;
  const where = {
    organizationId,
    ...activationWhere(params.status, true),
    ...(search
      ? {
          OR: [
            { name: { contains: search, mode: "insensitive" as const } },
            { primaryContact: { contains: search, mode: "insensitive" as const } },
            { email: { contains: search, mode: "insensitive" as const } },
            { tradeType: { contains: search, mode: "insensitive" as const } },
            { phone: { contains: search } },
            { cellPhone: { contains: search } },
          ],
        }
      : {}),
  };

  const orderBy = params.sort === "primaryContact" ? { primaryContact: { sort: params.dir, nulls: "last" as const } } : { name: params.dir };

  const [totalCount, vendors] = await Promise.all([
    db.vendor.count({ where }),
    db.vendor.findMany({
      where,
      orderBy,
      skip: (params.page - 1) * params.pageSize,
      take: params.pageSize,
      include: { certifications: { select: { title: true, expiresAt: true } } },
    }),
  ]);

  return { totalCount, vendors };
}

/** The newest expiry among a vendor's certifications whose title matches — the "current policy" date. */
function certificationExpiry(vendor: VendorRow, pattern: RegExp): Date | null {
  const dates = vendor.certifications.filter((cert) => pattern.test(cert.title)).map((cert) => cert.expiresAt);
  return dates.length === 0 ? null : new Date(Math.max(...dates.map((date) => date.getTime())));
}

function ExpiryCell({ date }: { date: Date | null }) {
  if (!date) return null;
  const expired = date < new Date();
  return <span className={expired ? "font-semibold text-red-600" : undefined}>{formatDate(date)}</span>;
}

function PhoneLink({ value }: { value: string | null }) {
  if (!value) return null;
  return (
    <a href={`tel:${value.replace(/[^\d+]/g, "")}`} className="whitespace-nowrap text-[var(--bt-primary)] hover:underline">
      {value}
    </a>
  );
}

export default async function SubsVendorsPage({ searchParams }: PageProps<"/vendors">) {
  let user;
  try {
    user = await currentAppUser();
  } catch (error) {
    return <SetupNotice detail={error instanceof Error ? error.message : String(error)} />;
  }
  if (!user) {
    return <SetupNotice detail="No organization found. Seed the database, then reload." />;
  }

  const params = parseDirectoryParams(await searchParams, STATUSES);
  const { totalCount, vendors } = await loadVendors(user.organizationId, params);

  const columns: readonly DirectoryColumn<VendorRow>[] = [
    {
      key: "name",
      label: "Company name",
      sortKey: "name",
      render: (vendor) => (
        <Link href={`/vendors/${vendor.id}`} className="font-medium text-[var(--bt-primary)] hover:underline">
          {vendor.name}
        </Link>
      ),
    },
    {
      key: "divisions",
      label: "Sub/vendor divisions",
      className: "max-w-xs",
      render: (vendor) => {
        const label = vendor.divisions.length > 0 ? vendor.divisions.join(", ") : vendor.tradeType;
        return label ? (
          <span className="line-clamp-2" title={label}>
            {label}
          </span>
        ) : null;
      },
    },
    { key: "activation", label: "Activation", render: (vendor) => <ActivationPill label={activationOf(vendor)} /> },
    { key: "primaryContact", label: "Primary contact", sortKey: "primaryContact", render: (vendor) => vendor.primaryContact },
    { key: "liability", label: "Liability exp.", render: (vendor) => <ExpiryCell date={certificationExpiry(vendor, /liabil/i)} /> },
    { key: "workersComp", label: "Worker's comp exp.", render: (vendor) => <ExpiryCell date={certificationExpiry(vendor, /work(er)?s?['’]?\s*comp/i)} /> },
    { key: "cell", label: "Cell", render: (vendor) => <PhoneLink value={vendor.cellPhone} /> },
    { key: "phone", label: "Phone", render: (vendor) => <PhoneLink value={vendor.phone} /> },
  ];

  const filterOptions = [
    { label: "All", href: directoryHref(BASE_PATH, params, { status: null, page: 1 }), active: params.status === null },
    ...STATUSES.map((status) => ({ label: STATUS_LABELS[status], href: directoryHref(BASE_PATH, params, { status, page: 1 }), active: params.status === status })),
  ];

  return (
    <div className="mx-auto flex max-w-[110rem] flex-col gap-4 p-6">
      <DirectoryHeader
        title="Subs/vendors"
        toolbar={
          <>
            <SearchForm params={params} placeholder="Search subs/vendors" />
            <FilterMenu options={filterOptions} activeCount={(params.status ? 1 : 0)} />
          </>
        }
        panels={[
          { id: "import", label: "Import", variant: "secondary", content: <ImportVendorsForm /> },
          { id: "create", label: "Sub/vendor", variant: "primary", content: <CreateVendorForm /> },
        ]}
      />

      <DirectoryTable
        basePath={BASE_PATH}
        params={params}
        columns={columns}
        rows={vendors}
        rowKey={(vendor) => vendor.id}
        emptyMessage={params.query || params.status ? "No subs/vendors match this search or filter." : "No subs/vendors yet. Add one, or import your list with Import."}
      />

      <Pagination basePath={BASE_PATH} params={params} totalCount={totalCount} />
    </div>
  );
}
