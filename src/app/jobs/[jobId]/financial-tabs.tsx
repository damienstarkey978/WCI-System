import Link from "next/link";

/**
 * Buildertrend's Purchase Orders / Bills toggle — the two pages share this top
 * strip rather than each only pointing at the other via the Financial nav
 * dropdown. Kept as its own small file since both pages' page.tsx import it.
 */
export function PurchaseOrdersBillsTabs({ jobId, active }: { jobId: string; active: "purchase-orders" | "bills" }) {
  const tabs = [
    { key: "purchase-orders" as const, label: "Purchase Orders" },
    { key: "bills" as const, label: "Bills" },
  ];

  return (
    <nav className="flex gap-1 border-b" style={{ borderColor: "var(--bt-border)" }}>
      {tabs.map((tab) => {
        const isActive = tab.key === active;
        return (
          <Link
            key={tab.key}
            href={`/jobs/${jobId}/${tab.key}`}
            className="-mb-px border-b-2 px-3 py-2 text-sm font-medium transition"
            style={{
              borderColor: isActive ? "var(--bt-primary)" : "transparent",
              color: isActive ? "var(--bt-primary)" : "var(--bt-muted)",
            }}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}

export { PageHeader as FinancialPageHeader } from "@/components/shell/PageHeader";
