"use client";

import { DataGrid, type DataGridColumn } from "@/components/shell/DataGrid";
import { formatDate } from "@/lib/format";

const STATUS_STYLE: Record<string, { bg: string; text: string }> = {
  PENDING: { bg: "color-mix(in srgb, var(--bt-hazard) 14%, transparent)", text: "var(--bt-hazard)" },
  APPROVED: { bg: "var(--bt-status-open-bg)", text: "var(--bt-status-open-text)" },
  REJECTED: { bg: "color-mix(in srgb, var(--bt-danger) 14%, transparent)", text: "var(--bt-danger)" },
  REVISE_AND_RESUBMIT: { bg: "color-mix(in srgb, var(--bt-primary) 14%, transparent)", text: "var(--bt-primary)" },
};

const TYPE_LABEL: Record<string, string> = {
  MATERIAL_SPEC: "Material spec",
  SHOP_DRAWING: "Shop drawing",
};

export interface SubmittalRow {
  readonly id: string;
  readonly title: string;
  readonly type: string;
  readonly status: string;
  readonly latestRevisionNumber: number | null;
  readonly latestRevisionAt: string | null;
}

/** Client half of the Submittals page; see purchase-orders-grid.tsx for why the split exists. */
export function SubmittalsGrid({ rows }: { rows: readonly SubmittalRow[] }) {
  const columns: DataGridColumn<SubmittalRow>[] = [
    { key: "title", header: "Title", sortable: true, render: (row) => <span className="font-medium">{row.title}</span> },
    { key: "type", header: "Type", render: (row) => TYPE_LABEL[row.type] ?? row.type },
    {
      key: "revision",
      header: "Latest revision",
      render: (row) => (row.latestRevisionNumber !== null && row.latestRevisionAt ? `Rev ${row.latestRevisionNumber}, ${formatDate(new Date(row.latestRevisionAt))}` : ""),
    },
    {
      key: "status",
      header: "Status",
      render: (row) => {
        const style = STATUS_STYLE[row.status] ?? STATUS_STYLE.PENDING;
        return (
          <span className="rounded px-1.5 py-0.5 text-[10px] font-semibold" style={{ background: style.bg, color: style.text }}>
            {row.status.replace(/_/g, " ")}
          </span>
        );
      },
    },
  ];

  return <DataGrid columns={columns} rows={rows} rowKey={(row) => row.id} viewKey="submittals" selectable emptyMessage="No submittals yet." />;
}
