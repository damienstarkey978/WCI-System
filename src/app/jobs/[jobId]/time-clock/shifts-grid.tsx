"use client";

import { DataGrid, type DataGridColumn } from "@/components/shell/DataGrid";
import { formatDate } from "@/lib/format";

import { reviewTimeClockEntryAction } from "./actions";

const STATUS_STYLE: Record<string, { bg: string; text: string }> = {
  PENDING: { bg: "color-mix(in srgb, var(--bt-hazard) 14%, transparent)", text: "var(--bt-hazard)" },
  APPROVED: { bg: "var(--bt-status-open-bg)", text: "var(--bt-status-open-text)" },
  REJECTED: { bg: "color-mix(in srgb, var(--bt-danger) 14%, transparent)", text: "var(--bt-danger)" },
};

export interface ShiftRow {
  readonly id: string;
  readonly jobId: string;
  readonly worker: string;
  readonly costCode: string;
  readonly clockInAt: string;
  readonly inProgress: boolean;
  readonly hours: number;
  readonly approvalStatus: string;
}

/** Client half of the Time Clock page; see purchase-orders-grid.tsx for why the split exists. */
export function ShiftsGrid({ rows, canReview }: { rows: readonly ShiftRow[]; canReview: boolean }) {
  const columns: DataGridColumn<ShiftRow>[] = [
    { key: "worker", header: "Worker", sortable: true, render: (row) => row.worker },
    { key: "costCode", header: "Cost code", render: (row) => row.costCode },
    { key: "date", header: "Date", sortable: true, sortValue: (row) => row.clockInAt, render: (row) => formatDate(new Date(row.clockInAt)) },
    {
      key: "hours",
      header: "Hours",
      align: "right",
      sortable: true,
      render: (row) => (row.inProgress ? "In progress" : `${row.hours.toFixed(2)} hrs`),
      total: `${rows.filter((row) => !row.inProgress).reduce((sum, row) => sum + row.hours, 0).toFixed(2)} hrs`,
    },
    {
      key: "status",
      header: "Status",
      render: (row) => {
        const style = STATUS_STYLE[row.approvalStatus] ?? STATUS_STYLE.PENDING;
        return (
          <span className="rounded px-1.5 py-0.5 text-[10px] font-semibold" style={{ background: style.bg, color: style.text }}>
            {row.approvalStatus}
          </span>
        );
      },
    },
  ];

  return (
    <DataGrid
      columns={columns}
      rows={rows}
      rowKey={(row) => row.id}
      selectable
      viewKey="time-clock-shifts"
      showTotals
      rowActions={
        canReview
          ? (row) =>
              row.approvalStatus === "PENDING" && !row.inProgress ? (
                <div className="flex justify-end gap-2">
                  {(["approve", "reject"] as const).map((decision) => (
                    <form key={decision} action={reviewTimeClockEntryAction}>
                      <input type="hidden" name="jobId" value={row.jobId} />
                      <input type="hidden" name="entryId" value={row.id} />
                      <input type="hidden" name="decision" value={decision} />
                      <button
                        type="submit"
                        className={decision === "approve" ? "rounded px-2 py-1 text-xs font-semibold text-[var(--bt-on-primary)]" : "rounded border px-2 py-1 text-xs font-semibold text-[var(--bt-muted)]"}
                        style={decision === "approve" ? { background: "var(--bt-primary)" } : { borderColor: "var(--bt-border)" }}
                      >
                        {decision === "approve" ? "Approve" : "Reject"}
                      </button>
                    </form>
                  ))}
                </div>
              ) : null
          : undefined
      }
      emptyMessage="No shifts to show."
    />
  );
}
