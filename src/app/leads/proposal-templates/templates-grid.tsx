"use client";

import Link from "next/link";

import { DataGrid, type DataGridColumn } from "@/components/shell/DataGrid";
import { formatDate } from "@/lib/format";

export interface TemplateRow {
  readonly id: string;
  readonly name: string;
  readonly description: string | null;
  readonly sectionCount: number;
  readonly drawCount: number;
  readonly updatedAt: string;
}

/** Client half of the Proposal Templates list; see purchase-orders-grid.tsx for why the split exists. */
export function TemplatesGrid({ rows }: { rows: readonly TemplateRow[] }) {
  const columns: DataGridColumn<TemplateRow>[] = [
    {
      key: "name",
      header: "Template",
      sortable: true,
      render: (row) => (
        <Link href={`/leads/proposal-templates/${row.id}`} className="font-medium text-[var(--bt-primary)] hover:underline">
          {row.name}
        </Link>
      ),
    },
    { key: "description", header: "Description", render: (row) => row.description ?? "" },
    { key: "sections", header: "Sections", align: "right", render: (row) => row.sectionCount },
    { key: "draws", header: "Payment milestones", align: "right", render: (row) => row.drawCount },
    { key: "updatedAt", header: "Updated", sortable: true, render: (row) => formatDate(new Date(row.updatedAt)) },
  ];

  return <DataGrid columns={columns} rows={rows} rowKey={(row) => row.id} selectable emptyMessage="No proposal templates yet." />;
}
