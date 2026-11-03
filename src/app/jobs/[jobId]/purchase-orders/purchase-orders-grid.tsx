"use client";

import { DataGrid, type DataGridColumn } from "@/components/shell/DataGrid";
import { InfoIcon, PencilIcon } from "@/components/shell/icons";
import { formatDate, formatMoney } from "@/lib/format";
import {
  formatPoNumberDisplay,
  formatPoStatusLabel,
  formatWorkStatusLabel,
} from "@/lib/purchase-orders/display";

import {
  PO_STATUS_SHOWS_INFO,
  PO_STATUS_STYLE,
  WORK_STATUS_SHOWS_INFO,
  WORK_STATUS_STYLE,
} from "./status-styles";

export interface PurchaseOrderRow {
  readonly id: string;
  readonly jobId: string;
  readonly jobName: string;
  readonly poNumber: string;
  readonly poSuffix: string | null;
  readonly title: string | null;
  readonly vendorName: string;
  readonly status: string;
  readonly workStatus: string;
  readonly createdAt: string;
  readonly totalCents: number;
  readonly materialsOnly: boolean;
  readonly scheduledCompletionOn: string | null;
  readonly completedOn: string | null;
  readonly linkedScheduleItemId: string | null;
  readonly linkedScheduleItemTitle: string | null;
  readonly scopeOfWork: string | null;
  readonly internalNotes: string | null;
  readonly vendorId: string | null;
  readonly outstandingCents: number;
  readonly billedPercent: number;
}

/** Buildertrend Standard View hides Total; keep it available via column chooser. */
const DEFAULT_HIDDEN = ["totalCents"] as const;

function StatusPill({
  label,
  style,
  showInfo,
}: {
  label: string;
  style: { bg: string; text: string };
  showInfo?: boolean;
}) {
  return (
    <span className="inline-flex items-center gap-1">
      <span
        className="rounded px-1.5 py-0.5 text-[10px] font-semibold leading-none"
        style={{ background: style.bg, color: style.text }}
      >
        {label}
      </span>
      {showInfo ? <InfoIcon className="h-3 w-3 text-[var(--bt-muted)]" /> : null}
    </span>
  );
}

/**
 * The client half of the Purchase Orders page — DataGrid's column `render`
 * callbacks are plain functions, which can't cross the server/client
 * component boundary as props, so the server page.tsx shapes the rows into
 * plain data and hands them to this "use client" wrapper to actually render.
 */
export function PurchaseOrdersGrid({
  rows,
  onEdit,
}: {
  rows: readonly PurchaseOrderRow[];
  onEdit: (row: PurchaseOrderRow) => void;
}) {
  const columns: DataGridColumn<PurchaseOrderRow>[] = [
    {
      key: "job",
      header: "Job",
      sortable: true,
      sortValue: (row) => row.jobName,
      render: (row) => <span className="text-[var(--bt-muted)]">{row.jobName}</span>,
    },
    {
      key: "poNumber",
      header: "PO #",
      sortable: true,
      sortValue: (row) => formatPoNumberDisplay(row.poNumber, row.poSuffix),
      render: (row) => (
        <button
          type="button"
          onClick={() => onEdit(row)}
          className="font-medium hover:underline"
          style={{ color: "var(--bt-primary)" }}
        >
          {formatPoNumberDisplay(row.poNumber, row.poSuffix)}
        </button>
      ),
    },
    {
      key: "title",
      header: "Title",
      sortable: true,
      sortValue: (row) => row.title ?? "",
      render: (row) => (
        <button type="button" onClick={() => onEdit(row)} className="text-left hover:underline" style={{ color: "var(--bt-primary)" }}>
          {row.title ?? "—"}
        </button>
      ),
    },
    {
      key: "status",
      header: "PO Status",
      sortable: true,
      sortValue: (row) => row.status,
      render: (row) => {
        const style = PO_STATUS_STYLE[row.status] ?? PO_STATUS_STYLE.DRAFT;
        return (
          <StatusPill
            label={formatPoStatusLabel(row.status)}
            style={style}
            showInfo={PO_STATUS_SHOWS_INFO.has(row.status)}
          />
        );
      },
    },
    {
      key: "workStatus",
      header: "Work Status",
      sortable: true,
      sortValue: (row) => row.workStatus,
      render: (row) => {
        const style = WORK_STATUS_STYLE[row.workStatus] ?? WORK_STATUS_STYLE.NOT_COMPLETE;
        return (
          <StatusPill
            label={formatWorkStatusLabel(row.workStatus)}
            style={style}
            showInfo={WORK_STATUS_SHOWS_INFO.has(row.workStatus)}
          />
        );
      },
    },
    {
      key: "vendorName",
      header: "Performed By",
      sortable: true,
      render: (row) => {
        const name = row.vendorName?.trim();
        if (!name || name === "Unassigned" || name === "Unknown vendor") {
          return <span className="text-[var(--bt-muted)]">—</span>;
        }
        return name;
      },
    },
    {
      key: "createdAt",
      header: "Created Date",
      sortable: true,
      render: (row) => formatDate(new Date(row.createdAt)),
    },
    {
      key: "totalCents",
      header: "Total",
      align: "right",
      sortable: true,
      render: (row) => formatMoney(row.totalCents),
    },
  ];

  return (
    <DataGrid
      columns={columns}
      rows={rows}
      rowKey={(row) => row.id}
      viewKey="purchase-orders-bt-standard"
      defaultHiddenKeys={DEFAULT_HIDDEN}
      selectable
      sortToolbarInFooter
      defaultSort={{ key: "createdAt", direction: "desc" }}
      rowActions={(row) => (
        <button
          type="button"
          onClick={() => onEdit(row)}
          aria-label={`Edit purchase order ${formatPoNumberDisplay(row.poNumber, row.poSuffix)}`}
          className="inline-flex rounded p-1 text-[var(--bt-muted)] hover:bg-black/5 hover:text-[var(--bt-primary)]"
        >
          <PencilIcon className="h-4 w-4" />
        </button>
      )}
      emptyMessage="No purchase orders yet."
    />
  );
}

/** Keep a full-page link available for the modal pop-out control. */
export function purchaseOrderDetailHref(row: Pick<PurchaseOrderRow, "jobId" | "id">): string {
  return `/jobs/${row.jobId}/purchase-orders/${row.id}`;
}
