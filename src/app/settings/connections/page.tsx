import { UserRole } from "@/generated/prisma/enums";
import { currentAppUserOrRedirect } from "@/lib/auth";
import { formatDate } from "@/lib/format";
import { listConnections } from "@/lib/oauth/connections";

import { disconnectApplication } from "./actions";

export const dynamic = "force-dynamic";

/** The same plain-language wording the consent screen used, so the two agree. */
const SCOPE_DESCRIPTIONS: Record<string, string> = {
  "jobs:read": "read jobs",
  "cost-codes:read": "read cost codes",
  "reports:read": "read financial reports",
  "leads:read": "read leads",
  "proposals:read": "read proposals",
  "proposals:write": "draft proposals",
};

/**
 * Connected applications — Claude, ChatGPT, or anything else someone has authorized
 * against /api/mcp.
 *
 * This page is the other half of the consent screen. That screen tells people they
 * can disconnect at any time from Settings, which is only true if there is somewhere
 * to do it; a permission granted with no visible way to take it back is not really a
 * permission, it is a one-way door.
 */
export default async function ConnectionsSettingsPage() {
  const user = await currentAppUserOrRedirect();
  const connections = await listConnections(user.organizationId);
  const isAdmin = user.role === UserRole.ADMIN;

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4 p-6">
      <div>
        <h1 className="text-xl font-semibold text-[var(--bt-text)]">Connected applications</h1>
        <p className="text-sm text-[var(--bt-muted)]">
          Assistants connected to WCI OS — Claude, ChatGPT, or anything else someone has authorized. Each acts as the
          person who connected it, and can draft proposals but never send one to a client.
        </p>
      </div>

      <div className="rounded-lg border bg-[var(--bt-panel-bg)]" style={{ borderColor: "var(--bt-border)" }}>
        <table className="w-full text-left text-sm">
          <thead>
            <tr
              className="border-b text-xs uppercase tracking-wide text-[var(--bt-muted)]"
              style={{ borderColor: "var(--bt-border)" }}
            >
              <th className="px-4 py-2 font-semibold">Application</th>
              <th className="px-4 py-2 font-semibold">Acting as</th>
              <th className="px-4 py-2 font-semibold">Can</th>
              <th className="px-4 py-2 font-semibold">Connected</th>
              <th className="px-4 py-2 font-semibold">Last used</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody>
            {connections.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-[var(--bt-muted)]">
                  Nothing is connected yet. Add WCI OS as a custom connector in Claude or ChatGPT using{" "}
                  <code className="text-[var(--bt-text)]">/api/mcp</code> on this domain.
                </td>
              </tr>
            ) : (
              connections.map((connection) => {
                const mine = connection.userId === user.id;
                return (
                  <tr
                    key={`${connection.oauthClientId}:${connection.userId}`}
                    className="border-b last:border-0"
                    style={{ borderColor: "var(--bt-border)" }}
                  >
                    <td className="px-4 py-3 font-medium text-[var(--bt-text)]">
                      {connection.clientName}
                      {connection.clientUri ? (
                        <span className="block text-xs font-normal text-[var(--bt-muted)]">{connection.clientUri}</span>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 text-[var(--bt-text)]">
                      {connection.userName}
                      {mine ? <span className="ml-1 text-xs text-[var(--bt-muted)]">(you)</span> : null}
                    </td>
                    <td className="px-4 py-3 text-xs text-[var(--bt-muted)]">
                      {connection.scopes.map((scope) => SCOPE_DESCRIPTIONS[scope] ?? scope).join(", ")}
                    </td>
                    <td className="px-4 py-3 text-[var(--bt-muted)]">{formatDate(connection.connectedAt)}</td>
                    <td className="px-4 py-3 text-[var(--bt-muted)]">
                      {connection.lastUsedAt ? formatDate(connection.lastUsedAt) : "never"}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {mine || isAdmin ? (
                        <form action={disconnectApplication}>
                          <input type="hidden" name="oauthClientId" value={connection.oauthClientId} />
                          <input type="hidden" name="userId" value={connection.userId} />
                          <button type="submit" className="text-[var(--bt-danger,#c0392b)] hover:underline">
                            Disconnect
                          </button>
                        </form>
                      ) : null}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-[var(--bt-muted)]">
        Disconnecting takes effect immediately — the application stops working on its next request, not when its token
        would have expired. Reconnecting is the same approval screen again.
      </p>
    </div>
  );
}
