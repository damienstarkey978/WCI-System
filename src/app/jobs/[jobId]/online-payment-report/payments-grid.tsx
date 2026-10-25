"use client";

import { DataGrid, type DataGridColumn } from "@/components/shell/DataGrid";
import { formatDate, formatMoney } from "@/lib/format";

export interface OnlinePaymentRow {
  readonly id: string;
  readonly receivedAt: string;
  readonly invoiceNumber: string;
  readonly method: string;
  readonly reference: string | null;
  readonly amountCents: number;
}

/** Client half of the Online Payment Report; see purchase-orders-grid.tsx for why the split exists. */
export function OnlinePaymentsGrid({ rows }: { rows: readonly OnlinePaymentRow[] }) {
  const columns: DataGridColumn<OnlinePaymentRow>[] = [
    { key: "receivedAt", header: "Payment date", sortable: true, render: (row) => formatDate(new Date(row.receivedAt)) },
    { key: "invoiceNumber", header: "Invoice #", sortable: true, render: (row) => <span className="font-medium">{row.invoiceNumber}</span> },
    { key: "method", header: "Payment method", render: (row) => row.method },
    { key: "reference", header: "Reference", render: (row) => row.reference ?? "—" },
    {
      key: "amountCents",
      header: "Amount",
      align: "right",
      sortable: true,
      render: (row) => formatMoney(row.amountCents),
      total: formatMoney(rows.reduce((sum, row) => sum + row.amountCents, 0)),
    },
  ];

  return <DataGrid columns={columns} rows={rows} rowKey={(row) => row.id} viewKey="payments" selectable showTotals emptyMessage="No online payments yet." />;
}
