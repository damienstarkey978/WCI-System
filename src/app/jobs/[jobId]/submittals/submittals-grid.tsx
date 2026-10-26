"use client";

import Link from "next/link";

import { DataGrid, type DataGridColumn } from "@/components/shell/DataGrid";
import { formatDate, formatDateUtc } from "@/lib/format";

const STATUS_LABEL: Record<string, string> = {
  DRAFT: "Draft",
  PENDING: "Needs review",
  IN_APPROVAL: "In approval",
  APPROVED: "Approved",
  APPROVED_AS_NOTED: "Approved as noted",
  REVISE_AND_RESUBMIT: "Revise and resubmit",
  REJECTED: "Rejected",
  VOIDED: "Voided",
  AWAITING_DOCUMENTS: "Awaiting documents",
};

const STATUS_STYLE: Record<string, { bg: string; text: string }> = {
  DRAFT: { bg: "#e5e7eb", text: "#374151" },
  PENDING: { bg: "color-mix(in srgb, var(--bt-hazard) 14%, transparent)", text: "var(--bt-hazard)" },
  IN_APPROVAL: { bg: "color-mix(in srgb, var(--bt-primary) 14%, transparent)", text: "var(--bt-primary)" },
  APPROVED: { bg: "var(--bt-status-open-bg)", text: "var(--bt-status-open-text)" },
  APPROVED_AS_NOTED: { bg: "var(--bt-status-open-bg)", text: "var(--bt-status-open-text)" },
  REVISE_AND_RESUBMIT: { bg: "color-mix(in srgb, var(--bt-primary) 14%, transparent)", text: "var(--bt-primary)" },
  REJECTED: { bg: "color-mix(in srgb, var(--bt-danger) 14%, transparent)", text: "var(--bt-danger)" },
  VOIDED: { bg: "#e5e7eb", text: "#374151" },
  AWAITING_DOCUMENTS: { bg: "color-mix(in srgb, var(--bt-hazard) 14%, transparent)", text: "var(--bt-hazard)" },
};

const TYPE_LABEL: Record<string, string> = {
  MATERIAL_SPEC: "Material spec",
  SHOP_DRAWING: "Shop drawing",
  PRODUCT_DATA: "Product data",
  SAMPLE: "Sample",
  OTHER: "Other",
};

export interface SubmittalRow {
  readonly id: string;
  readonly jobId: string;
  readonly number: number;
  readonly title: string;
  readonly type: string;
  readonly status: string;
  readonly packageName: string | null;
  readonly division: string | null;
  readonly finalDueDate: string | null;
  readonly managerName: string | null;
  readonly latestRevisionNumber: number | null;
  readonly latestRevisionAt: string | null;
}

/** Client half of the Submittals page; see purchase-orders-grid.tsx for why the split exists. */
export function SubmittalsGrid({ rows }: { rows: readonly SubmittalRow[] }) {
  const columns: DataGridColumn<SubmittalRow>[] = [
    {
      key: "number",
      header: "#",
      sortable: true,
      render: (row) => (
        <Link href={`/jobs/${row.jobId}/submittals/${row.id}`} className="font-medium text-[var(--bt-primary)] hover:underline">
          {String(row.number).padStart(4, "0")}
        </Link>
      ),
    },
    {
      key: "title",
      header: "Title",
      sortable: true,
      render: (row) => (
        <Link href={`/jobs/${row.jobId}/submittals/${row.id}`} className="font-medium hover:underline">
          {row.title}
        </Link>
      ),
    },
    { key: "type", header: "Type", render: (row) => TYPE_LABEL[row.type] ?? row.type },
    { key: "package", header: "Package", render: (row) => row.packageName ?? "" },
    { key: "division", header: "Division", render: (row) => row.division ?? "" },
    {
      key: "due",
      header: "Final due",
      sortable: true,
      render: (row) => (row.finalDueDate ? formatDateUtc(new Date(row.finalDueDate)) : ""),
    },
    { key: "manager", header: "Manager", render: (row) => row.managerName ?? "" },
    {
      key: "revision",
      header: "Latest rev",
      render: (row) =>
        row.latestRevisionNumber !== null && row.latestRevisionAt
          ? `Rev ${row.latestRevisionNumber}, ${formatDate(new Date(row.latestRevisionAt))}`
          : "",
    },
    {
      key: "status",
      header: "Status",
      render: (row) => {
        const style = STATUS_STYLE[row.status] ?? STATUS_STYLE.PENDING;
        return (
          <span className="rounded px-1.5 py-0.5 text-[10px] font-semibold" style={{ background: style.bg, color: style.text }}>
            {STATUS_LABEL[row.status] ?? row.status}
          </span>
        );
      },
    },
  ];

  return <DataGrid columns={columns} rows={rows} rowKey={(row) => row.id} viewKey="submittals" selectable emptyMessage="No submittals yet." />;
}
