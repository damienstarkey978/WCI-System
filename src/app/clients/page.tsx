import Link from "next/link";

import { SetupNotice } from "@/app/admin/setup-notice";
import { DirectoryHeader, FilterMenu, Pagination } from "@/components/directory/directory-controls";
import { ActivationPill, DirectoryTable, SearchForm, type DirectoryColumn } from "@/components/directory/directory-table";
import { currentAppUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { activationOf, activationWhere } from "@/lib/directory/activation";
import { directoryHref, parseDirectoryParams, type ActivationFilter } from "@/lib/directory/params";

import { CreateClientForm } from "./create-client-form";
import { ImportClientsForm } from "./import-clients-form";

export const dynamic = "force-dynamic";

const BASE_PATH = "/clients";
// A client always has an email (it's required), so "No Email" doesn't apply here the way it does for subs.
const STATUSES: readonly ActivationFilter[] = ["active", "pending", "inactive"];
const STATUS_LABELS: Record<ActivationFilter, string> = { active: "Active", pending: "Pending", inactive: "Inactive", "no-email": "No Email" };

type ClientRow = Awaited<ReturnType<typeof loadClients>>["clients"][number];

const SORTABLE = { name: "name", addressLine1: "addressLine1", city: "city", state: "state", postalCode: "postalCode" } as const;

async function loadClients(organizationId: string, params: ReturnType<typeof parseDirectoryParams>) {
  const search = params.query;
  const where = {
    organizationId,
    ...activationWhere(params.status, false),
    ...(search
      ? {
          OR: [
            { name: { contains: search, mode: "insensitive" as const } },
            { email: { contains: search, mode: "insensitive" as const } },
            { addressLine1: { contains: search, mode: "insensitive" as const } },
            { city: { contains: search, mode: "insensitive" as const } },
            { phone: { contains: search } },
            { cellPhone: { contains: search } },
          ],
        }
      : {}),
  };

  const sortField = (params.sort && params.sort in SORTABLE ? SORTABLE[params.sort as keyof typeof SORTABLE] : "name") as keyof typeof SORTABLE;
  const orderBy = sortField === "name" ? { name: params.dir } : { [sortField]: { sort: params.dir, nulls: "last" as const } };

  const [totalCount, clients] = await Promise.all([
    db.client.count({ where }),
    db.client.findMany({
      where,
      orderBy,
      skip: (params.page - 1) * params.pageSize,
      take: params.pageSize,
      include: { _count: { select: { jobAccess: true } } },
    }),
  ]);

  return { totalCount, clients };
}

function PhoneLink({ value }: { value: string | null }) {
  if (!value) return null;
  return (
    <a href={`tel:${value.replace(/[^\d+]/g, "")}`} className="whitespace-nowrap text-[var(--bt-primary)] hover:underline">
      {value}
    </a>
  );
}

export default async function ClientContactsPage({ searchParams }: PageProps<"/clients">) {
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
  const { totalCount, clients } = await loadClients(user.organizationId, params);

  const columns: readonly DirectoryColumn<ClientRow>[] = [
    {
      key: "name",
      label: "Display Name",
      sortKey: "name",
      render: (client) => (
        <Link href={`/clients/${client.id}`} className="font-medium text-[var(--bt-primary)] hover:underline">
          {client.name}
        </Link>
      ),
    },
    { key: "activation", label: "Activation Status", render: (client) => <ActivationPill label={activationOf(client)} /> },
    { key: "phone", label: "Primary Phone", render: (client) => <PhoneLink value={client.phone} /> },
    { key: "cell", label: "Cell Phone", render: (client) => <PhoneLink value={client.cellPhone} /> },
    { key: "address", label: "Street Address", sortKey: "addressLine1", render: (client) => client.addressLine1 },
    { key: "city", label: "City", sortKey: "city", render: (client) => client.city },
    { key: "state", label: "State", sortKey: "state", render: (client) => client.state },
    { key: "postalCode", label: "Zip Code", sortKey: "postalCode", render: (client) => client.postalCode },
    { key: "jobs", label: "Jobs", render: (client) => client._count.jobAccess },
  ];

  const filterOptions = [
    { label: "All", href: directoryHref(BASE_PATH, params, { status: null, page: 1 }), active: params.status === null },
    ...STATUSES.map((status) => ({ label: STATUS_LABELS[status], href: directoryHref(BASE_PATH, params, { status, page: 1 }), active: params.status === status })),
  ];

  return (
    <div className="mx-auto flex max-w-[110rem] flex-col gap-4 p-6">
      <DirectoryHeader
        title="Client Contacts"
        toolbar={
          <>
            <SearchForm params={params} placeholder="Search client contacts" />
            <FilterMenu options={filterOptions} activeCount={params.status ? 1 : 0} />
          </>
        }
        panels={[
          { id: "create", label: "Contact", variant: "primary", content: <CreateClientForm /> },
          { id: "import", label: "Import", variant: "secondary", content: <ImportClientsForm /> },
        ]}
      />

      <DirectoryTable
        basePath={BASE_PATH}
        params={params}
        columns={columns}
        rows={clients}
        rowKey={(client) => client.id}
        emptyMessage={params.query || params.status ? "No client contacts match this search or filter." : "No client contacts yet. Add one with + Contact."}
      />

      <Pagination basePath={BASE_PATH} params={params} totalCount={totalCount} />
    </div>
  );
}
