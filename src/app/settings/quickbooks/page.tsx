import { SetupNotice } from "@/app/admin/setup-notice";
import { UserRole } from "@/generated/prisma/enums";
import { currentAppUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { isQuickBooksConfigured } from "@/lib/env";

import { disconnectQuickBooksAction } from "./actions";

export const dynamic = "force-dynamic";

const ERROR_MESSAGES: Record<string, string> = {
  missing_params: "QuickBooks redirected back without the expected parameters. Try connecting again.",
  invalid_state: "That connection attempt expired or was tampered with. Try connecting again.",
  access_denied: "The QuickBooks connection was cancelled.",
};

/**
 * Admin-only QuickBooks connection status + connect/disconnect (CLAUDE.md 2.3). Customer
 * and Invoice sync themselves are triggered from their own pages (an explicit action per
 * record, same "one place computes the numbers" pattern as Send to Budget / Push to PO)
 * rather than an automatic background job — WCI OS has no queue infrastructure yet.
 */
export default async function QuickBooksSettingsPage({ searchParams }: PageProps<"/settings/quickbooks">) {
  let user;
  try {
    user = await currentAppUser();
  } catch (error) {
    return <SetupNotice detail={error instanceof Error ? error.message : String(error)} />;
  }
  if (!user) {
    return <SetupNotice detail="No organization found. Seed the database, then reload." />;
  }
  if (user.role !== UserRole.ADMIN) {
    return (
      <div className="mx-auto max-w-2xl p-6">
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
          Only an admin can manage the QuickBooks connection.
        </div>
      </div>
    );
  }

  const params = await searchParams;
  const errorParam = typeof params.error === "string" ? params.error : undefined;
  const justConnected = params.connected === "1";

  const connection = await db.quickBooksConnection.findUnique({ where: { organizationId: user.organizationId } });
  const isConnected = Boolean(connection && !connection.disconnectedAt);

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4 p-6">
      <h1 className="text-xl font-semibold text-[var(--bt-text)]">QuickBooks</h1>

      {!isQuickBooksConfigured() ? (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
          QuickBooks is not configured on this server. Set QBO_CLIENT_ID, QBO_CLIENT_SECRET, QBO_REDIRECT_URI, and
          QBO_TOKEN_ENCRYPTION_KEY.
        </div>
      ) : null}

      {errorParam ? (
        <div className="rounded-lg border border-red-300 bg-red-50 p-4 text-sm text-red-950">
          {ERROR_MESSAGES[errorParam] ?? `Connection failed: ${errorParam}`}
        </div>
      ) : null}

      {justConnected ? (
        <div className="rounded-lg border border-emerald-300 bg-emerald-50 p-4 text-sm text-emerald-950">
          Connected to QuickBooks.
        </div>
      ) : null}

      <div className="rounded-lg border bg-[var(--bt-panel-bg)] p-4" style={{ borderColor: "var(--bt-border)" }}>
        {isConnected && connection ? (
          <div className="flex flex-col gap-3 text-sm">
            <div>
              <span className="font-semibold text-[var(--bt-text)]">Status: </span>
              <span className="text-emerald-700">Connected</span>
            </div>
            <div className="text-[var(--bt-muted)]">
              Company (realm) ID: <span className="font-mono">{connection.realmId}</span>
            </div>
            <div className="text-[var(--bt-muted)]">Environment: {connection.environment === "PRODUCTION" ? "Production" : "Sandbox"}</div>
            <div className="text-[var(--bt-muted)]">Connected: {connection.connectedAt.toLocaleString()}</div>
            <form action={disconnectQuickBooksAction}>
              <button
                type="submit"
                className="w-fit rounded border px-3 py-1.5 text-sm text-[var(--bt-text)] hover:bg-black/5"
                style={{ borderColor: "var(--bt-border)" }}
              >
                Disconnect
              </button>
            </form>
          </div>
        ) : (
          <div className="flex flex-col gap-3 text-sm">
            <p className="text-[var(--bt-muted)]">
              Not connected. Connecting lets WCI OS push Customers and Invoices to QuickBooks, and bring Invoice
              Payments back in automatically.
            </p>
            <a
              href="/api/staff/quickbooks/connect"
              className="w-fit rounded bg-[var(--bt-primary)] px-3 py-1.5 text-sm font-medium text-white hover:opacity-90 aria-disabled:pointer-events-none aria-disabled:opacity-50"
              aria-disabled={!isQuickBooksConfigured()}
            >
              Connect to QuickBooks
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
