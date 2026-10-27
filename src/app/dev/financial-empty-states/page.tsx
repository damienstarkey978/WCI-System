/**
 * Fixture gallery for financial list EmptyState icons (WCI-58).
 * Client-safe static page — no DB. Not linked from nav.
 */
import { EmptyState } from "@/components/shell/EmptyState";
import {
  BidIcon,
  ChartIcon,
  DocumentIcon,
  InboxIcon,
  PaymentCardIcon,
  PurchaseOrderIcon,
  ReceiptIcon,
} from "@/components/shell/icons";

const SAMPLES = [
  {
    key: "purchase-orders",
    label: "Purchase Orders",
    icon: <PurchaseOrderIcon className="h-10 w-10" />,
    title: "No purchase orders yet",
    description: "Create a purchase order for materials or subcontract work on this job.",
    actionLabel: "+ Purchase Order",
  },
  {
    key: "bills",
    label: "Bills",
    icon: <ReceiptIcon className="h-10 w-10" />,
    title: "No bills yet",
    description: "Drop a receipt above, forward one to the inbox address, or add a bill by hand.",
    actionLabel: "+ Bill",
  },
  {
    key: "budget",
    label: "Budget",
    icon: <ChartIcon className="h-10 w-10" />,
    title: "No budget lines yet",
    description: "Send an estimate to budget to populate cost codes and the commitment funnel for this job.",
  },
  {
    key: "invoices",
    label: "Invoices",
    icon: <DocumentIcon className="h-10 w-10" />,
    title: "No invoices yet",
    description: "Create an invoice or draw for this job's client.",
    actionLabel: "+ Invoice",
  },
  {
    key: "estimates",
    label: "Estimates",
    icon: <ChartIcon className="h-10 w-10" />,
    title: "Build your estimate",
    description: "Create an estimate worksheet with cost codes, markup, and client pricing.",
    actionLabel: "+ Estimate",
  },
  {
    key: "bids",
    label: "Bids",
    icon: <BidIcon className="h-10 w-10" />,
    title: "Manage your Bids in one place",
    description: "Send bids, track responses, and compare bid amounts.",
    actionLabel: "+ Bid Package",
  },
  {
    key: "cost-inbox",
    label: "Cost Inbox",
    icon: <InboxIcon className="h-10 w-10" />,
    title: "You're all caught up",
    description: "Scanned receipts and bills waiting on review will appear here.",
    actionLabel: "Go to Bills",
  },
  {
    key: "online-payments",
    label: "Online payments",
    icon: <PaymentCardIcon className="h-10 w-10" />,
    title: "No online payments yet",
    description: "Payments made through the client portal will appear here.",
  },
] as const;

export default function FinancialEmptyStatesFixturePage() {
  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-8 bg-[var(--bt-page-bg,#f3f4f6)] p-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-lg font-semibold text-[var(--bt-text)]">Financial empty-state icons</h1>
        <p className="text-sm text-[var(--bt-muted)]">
          Dev fixture for WCI-58 — same EmptyState + stroke icons wired on the live list pages.
        </p>
      </header>
      <div className="grid gap-6 sm:grid-cols-2">
        {SAMPLES.map((sample) => (
          <section key={sample.key} className="flex flex-col gap-2" data-fixture={sample.key}>
            <h2 className="text-xs font-semibold uppercase tracking-wide text-[var(--bt-muted)]">{sample.label}</h2>
            <EmptyState
              icon={sample.icon}
              title={sample.title}
              description={sample.description}
              action={
                "actionLabel" in sample && sample.actionLabel ? (
                  <button
                    type="button"
                    className="rounded px-3 py-2 text-sm font-semibold text-[var(--bt-on-primary,#fff)]"
                    style={{ background: "var(--bt-primary)" }}
                  >
                    {sample.actionLabel}
                  </button>
                ) : undefined
              }
            />
          </section>
        ))}
      </div>
    </div>
  );
}
