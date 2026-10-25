"use client";

import Link from "next/link";

import { DataGrid, type DataGridColumn } from "@/components/shell/DataGrid";
import { formatDate, formatMoney } from "@/lib/format";

import { StageSelect } from "./stage-select";

export interface LeadRow {
  readonly id: string;
  readonly title: string;
  readonly converted: boolean;
  readonly contactName: string;
  readonly contactEmail: string | null;
  readonly createdAt: string;
  readonly stage: string;
  readonly ageDays: number;
  readonly confidencePercent: number;
  readonly revenueMinCents: number | null;
  readonly revenueMaxCents: number | null;
}

/** Client half of the Lead Opportunities list; see purchase-orders-grid.tsx for why the split exists. */
export function LeadsGrid({ rows }: { rows: readonly LeadRow[] }) {
  const columns: DataGridColumn<LeadRow>[] = [
    {
      key: "title",
      header: "Title",
      sortable: true,
      render: (row) => (
        <div className="whitespace-nowrap">
          <Link href={`/leads/${row.id}`} className="font-medium text-[var(--bt-primary)] hover:underline">
            {row.title}
          </Link>
          {row.converted ? <div className="text-[10px] font-semibold text-[var(--bt-status-open-text)]">Converted</div> : null}
        </div>
      ),
    },
    {
      key: "contact",
      header: "Client contact",
      render: (row) => (
        <div className="text-[var(--bt-muted)]">
          {row.contactName}
          {row.contactEmail ? <div className="text-xs">{row.contactEmail}</div> : null}
        </div>
      ),
    },
    { key: "createdAt", header: "Created date", sortable: true, render: (row) => formatDate(new Date(row.createdAt)) },
    { key: "stage", header: "Lead status", render: (row) => <StageSelect leadId={row.id} stage={row.stage} /> },
    { key: "age", header: "Age", align: "right", sortable: true, render: (row) => `${row.ageDays} days` },
    {
      key: "confidence",
      header: "Confidence",
      align: "right",
      sortable: true,
      render: (row) => (
        <div className="flex items-center justify-end gap-2">
          <div className="h-1.5 w-16 overflow-hidden rounded-full bg-black/10">
            <div className="h-full rounded-full" style={{ width: `${row.confidencePercent}%`, background: "var(--bt-primary)" }} />
          </div>
          <span>{row.confidencePercent}%</span>
        </div>
      ),
    },
    { key: "revenueMin", header: "Est. revenue min", align: "right", render: (row) => (row.revenueMinCents !== null ? formatMoney(row.revenueMinCents) : "") },
    { key: "revenueMax", header: "Est. revenue max", align: "right", render: (row) => (row.revenueMaxCents !== null ? formatMoney(row.revenueMaxCents) : "") },
  ];

  return <DataGrid columns={columns} rows={rows} rowKey={(row) => row.id} selectable emptyMessage="No lead opportunities yet." />;
}
