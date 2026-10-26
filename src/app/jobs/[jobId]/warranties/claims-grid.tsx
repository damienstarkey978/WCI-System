"use client";

import Link from "next/link";

import { DataGrid, type DataGridColumn } from "@/components/shell/DataGrid";
import { formatDate } from "@/lib/format";

import { ScheduleAppointmentForm, type VendorOption } from "./schedule-appointment-form";

const STATUS_STYLE: Record<string, { bg: string; text: string }> = {
  SUBMITTED: { bg: "color-mix(in srgb, var(--bt-hazard) 14%, transparent)", text: "var(--bt-hazard)" },
  SCHEDULED: { bg: "color-mix(in srgb, var(--bt-primary) 14%, transparent)", text: "var(--bt-primary)" },
  IN_PROGRESS: { bg: "color-mix(in srgb, var(--bt-primary) 14%, transparent)", text: "var(--bt-primary)" },
  COMPLETED: { bg: "var(--bt-status-open-bg)", text: "var(--bt-status-open-text)" },
  CLOSED: { bg: "#e5e7eb", text: "#374151" },
};

export interface ClaimRow {
  readonly id: string;
  readonly jobId: string;
  readonly claimNumber: string;
  readonly title: string;
  readonly description: string;
  readonly status: string;
  readonly priority: string | null;
  readonly category: string | null;
  readonly createdAt: string;
  readonly assignedVendor: string | null;
  readonly appointmentAt: string | null;
}

/** Client half of the Warranties page; see purchase-orders-grid.tsx for why the split exists. */
export function ClaimsGrid({ rows, vendors }: { rows: readonly ClaimRow[]; vendors: readonly VendorOption[] }) {
  const columns: DataGridColumn<ClaimRow>[] = [
    {
      key: "claimNumber",
      header: "Claim #",
      sortable: true,
      render: (row) => (
        <Link href={`/jobs/${row.jobId}/warranties/${row.id}`} className="font-medium text-[var(--bt-primary)] hover:underline">
          {row.claimNumber}
        </Link>
      ),
    },
    {
      key: "title",
      header: "Title",
      render: (row) => (
        <div>
          <Link href={`/jobs/${row.jobId}/warranties/${row.id}`} className="font-medium hover:underline">
            {row.title}
          </Link>
          <div className="max-w-md truncate text-xs text-[var(--bt-muted)]">{row.description}</div>
        </div>
      ),
    },
    { key: "category", header: "Category", render: (row) => row.category || "Unassigned" },
    { key: "priority", header: "Priority", render: (row) => row.priority || "Low" },
    { key: "createdAt", header: "Submitted", sortable: true, render: (row) => formatDate(new Date(row.createdAt)) },
    { key: "assigned", header: "Assigned to", render: (row) => row.assignedVendor ?? "" },
    { key: "appointment", header: "Appointment", render: (row) => (row.appointmentAt ? formatDate(new Date(row.appointmentAt)) : "") },
    {
      key: "status",
      header: "Status",
      render: (row) => {
        const style = STATUS_STYLE[row.status] ?? STATUS_STYLE.SUBMITTED;
        return (
          <span className="rounded px-1.5 py-0.5 text-[10px] font-semibold" style={{ background: style.bg, color: style.text }}>
            {row.status.replace(/_/g, " ")}
          </span>
        );
      },
    },
  ];

  return (
    <DataGrid
      columns={columns}
      rows={rows}
      rowKey={(row) => row.id} viewKey="warranty-claims"
      selectable
      rowActions={(row) => (row.status === "SUBMITTED" ? <ScheduleAppointmentForm jobId={row.jobId} claimId={row.id} vendors={vendors} /> : null)}
      emptyMessage="No warranty claims yet."
    />
  );
}
