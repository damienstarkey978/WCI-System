"use client";

import Link from "next/link";

import { ActivityStatusPill, ActivityTypeIcon } from "@/components/leads/activity-type";
import { DataGrid, type DataGridColumn } from "@/components/shell/DataGrid";
import { formatDate } from "@/lib/format";

export interface ActivityRow {
  readonly id: string;
  readonly leadId: string;
  readonly title: string;
  readonly type: string;
  readonly typeLabel: string;
  readonly status: "PAST_DUE" | "PENDING" | "COMPLETED" | "LOGGED";
  readonly assignedUser: string | null;
  readonly attendees: string | null;
  readonly contactDate: string;
  readonly activityNotes: string;
  readonly cellPhone: string | null;
  readonly city: string | null;
  readonly email: string | null;
  readonly completed: boolean;
}

/** Buildertrend Activity view columns for the Lead Activities list. */
export function ActivitiesGrid({ rows }: { rows: readonly ActivityRow[] }) {
  const columns: DataGridColumn<ActivityRow>[] = [
    {
      key: "status",
      header: "Status",
      sortable: true,
      sortValue: (row) => row.status,
      render: (row) => <ActivityStatusPill status={row.status} />,
    },
    {
      key: "type",
      header: "Type",
      sortable: true,
      sortValue: (row) => row.typeLabel,
      render: (row) => (
        <div className="flex min-w-[10rem] items-center gap-2">
          <ActivityTypeIcon type={row.type} size="sm" completed={row.completed} btLabel={row.typeLabel} />
          <span className="text-sm text-[var(--bt-text)]">{row.typeLabel}</span>
        </div>
      ),
    },
    {
      key: "title",
      header: "Title",
      sortable: true,
      render: (row) => (
        <Link
          href={`/leads/${row.leadId}?tab=activities`}
          className="block max-w-[14rem] truncate font-medium text-[var(--bt-primary)] hover:underline"
          title={row.title}
        >
          {row.title}
        </Link>
      ),
    },
    {
      key: "assignedUser",
      header: "Assigned User",
      sortable: true,
      render: (row) => <span className="whitespace-nowrap text-sm text-[var(--bt-text)]">{row.assignedUser ?? ""}</span>,
    },
    {
      key: "attendees",
      header: "Attendees",
      render: (row) => <span className="text-sm text-[var(--bt-muted)]">{row.attendees ?? ""}</span>,
    },
    {
      key: "contactDate",
      header: "Contact Date",
      sortable: true,
      sortValue: (row) => row.contactDate,
      render: (row) => <span className="whitespace-nowrap text-sm">{formatDate(new Date(row.contactDate))}</span>,
    },
    {
      key: "activityNotes",
      header: "Activity Notes",
      render: (row) => (
        <span className="line-clamp-2 max-w-[16rem] text-sm text-[var(--bt-text)]" title={row.activityNotes}>
          {row.activityNotes}
        </span>
      ),
    },
    {
      key: "cellPhone",
      header: "Cell Phone",
      render: (row) =>
        row.cellPhone ? (
          <a href={`tel:${row.cellPhone.replace(/[^\d+]/g, "")}`} className="whitespace-nowrap text-sm text-[var(--bt-primary)] hover:underline">
            {row.cellPhone}
          </a>
        ) : (
          ""
        ),
    },
    {
      key: "city",
      header: "City",
      sortable: true,
      render: (row) => <span className="text-sm text-[var(--bt-text)]">{row.city ?? ""}</span>,
    },
    {
      key: "email",
      header: "Email Address",
      render: (row) => <span className="max-w-[12rem] truncate text-sm text-[var(--bt-text)]">{row.email ?? ""}</span>,
    },
  ];

  return (
    <DataGrid
      columns={columns}
      rows={rows}
      rowKey={(row) => row.id}
      viewKey="lead-activities"
      selectable
      emptyMessage="No activity matches."
      sortToolbarInFooter
      defaultSort={{ key: "contactDate", direction: "asc" }}
    />
  );
}
