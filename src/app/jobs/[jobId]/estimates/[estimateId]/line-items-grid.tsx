"use client";

import { DataGrid, type DataGridColumn } from "@/components/shell/DataGrid";
import { formatMoney, formatPercent } from "@/lib/format";

import { deleteJobEstimateLineItemAction } from "../actions";

export interface LineItemRow {
  readonly id: string;
  readonly costCode: string;
  readonly title: string;
  readonly groupLabel: string | null;
  readonly quantityMilli: number;
  readonly unitCostCents: number;
  readonly rateMode: string;
  readonly rateBasisPoints: number;
  readonly costCents: number;
  readonly clientPriceCents: number;
}

/** The estimate worksheet's line items; see purchase-orders-grid.tsx for why this is a client file. */
export function LineItemsGrid({ jobId, estimateId, rows, editable }: { jobId: string; estimateId: string; rows: readonly LineItemRow[]; editable: boolean }) {
  const columns: DataGridColumn<LineItemRow>[] = [
    { key: "costCode", header: "Cost code", render: (row) => row.costCode },
    {
      key: "title",
      header: "Items",
      sortable: true,
      render: (row) => (
        <div>
          <div className="font-medium">{row.title}</div>
          {row.groupLabel ? <div className="text-xs text-[var(--bt-muted)]">{row.groupLabel}</div> : null}
        </div>
      ),
    },
    { key: "quantity", header: "Quantity", align: "right", render: (row) => (row.quantityMilli / 1000).toLocaleString("en-US", { maximumFractionDigits: 3 }) },
    { key: "unitCost", header: "Unit cost", align: "right", render: (row) => formatMoney(row.unitCostCents) },
    {
      key: "cost",
      header: "Builder cost",
      align: "right",
      render: (row) => formatMoney(row.costCents),
      total: formatMoney(rows.reduce((sum, row) => sum + row.costCents, 0)),
    },
    {
      key: "rate",
      header: "Markup / margin",
      align: "right",
      render: (row) => `${formatPercent(row.rateBasisPoints)} ${row.rateMode === "MARGIN" ? "margin" : "markup"}`,
    },
    {
      key: "clientPrice",
      header: "Client price",
      align: "right",
      render: (row) => formatMoney(row.clientPriceCents),
      total: formatMoney(rows.reduce((sum, row) => sum + row.clientPriceCents, 0)),
    },
    {
      key: "profit",
      header: "Profit",
      align: "right",
      render: (row) => formatMoney(row.clientPriceCents - row.costCents),
      total: formatMoney(rows.reduce((sum, row) => sum + (row.clientPriceCents - row.costCents), 0)),
    },
  ];

  return (
    <DataGrid
      columns={columns}
      rows={rows}
      rowKey={(row) => row.id}
      selectable
      showTotals
      pageSize={100}
      rowActions={
        editable
          ? (row) => (
              <form action={deleteJobEstimateLineItemAction}>
                <input type="hidden" name="jobId" value={jobId} />
                <input type="hidden" name="estimateId" value={estimateId} />
                <input type="hidden" name="lineItemId" value={row.id} />
                <button type="submit" className="text-xs text-[var(--bt-muted)] hover:text-red-600 hover:underline">
                  Delete
                </button>
              </form>
            )
          : undefined
      }
      emptyMessage="No line items yet. Use + Line item to add the first one."
    />
  );
}
