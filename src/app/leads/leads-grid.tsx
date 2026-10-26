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
  readonly contactPhone: string | null;
  readonly contactEmail: string | null;
  readonly source: string | null;
  readonly createdAt: string;
  readonly stage: string;
  readonly ageDays: number;
  readonly confidencePercent: number;
  readonly revenueMinCents: number | null;
  readonly revenueMaxCents: number | null;
}

/** Buildertrend Lead Opportunities Standard View: Lead Name, Stage, Contact, Phone, Email, … */
const DEFAULT_HIDDEN = ["age", "confidence", "revenueMin", "revenueMax"] as const;

/** Client half of the Lead Opportunities list; see purchase-orders-grid.tsx for why the split exists. */
export function LeadsGrid({ rows }: { rows: readonly LeadRow[] }) {
  const columns: DataGridColumn<LeadRow>[] = [
    {
      key: "title",
      header: "Lead Name",
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
    { key: "stage", header: "Stage", render: (row) => <StageSelect leadId={row.id} stage={row.stage} /> },
    { key: "contact", header: "Contact", render: (row) => row.contactName },
    { key: "phone", header: "Phone", render: (row) => row.contactPhone ?? "" },
    { key: "email", header: "Email", render: (row) => row.contactEmail ?? "" },
    { key: "source", header: "Lead Source", render: (row) => row.source ?? "" },
    { key: "createdAt", header: "Created Date", sortable: true, render: (row) => formatDate(new Date(row.createdAt)) },
    { key: "age", header: "Age", align: "right", sortable: true, sortValue: (row) => row.ageDays, render: (row) => `${row.ageDays} days` },
    {
      key: "confidence",
      header: "Confidence",
      align: "right",
      sortable: true,
      sortValue: (row) => row.confidencePercent,
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

  return (
    <DataGrid
      columns={columns}
      rows={rows}
      rowKey={(row) => row.id}
      selectable
      viewKey="lead-opportunities"
      defaultHiddenKeys={DEFAULT_HIDDEN}
      emptyMessage="No lead opportunities yet."
    />
  );
}
