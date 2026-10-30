import { UserRole } from "@/generated/prisma/enums";
import { currentAppUserOrRedirect } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatDate } from "@/lib/format";
import { listConnections } from "@/lib/oauth/connections";
import { MCP_GRANTABLE_SCOPES } from "@/lib/oauth/service";

import { disconnectApplication, setConnectionActingApiKey } from "./actions";

export const dynamic = "force-dynamic";

/** The same plain-language wording the consent screen used, so the two agree. */
const SCOPE_DESCRIPTIONS: Record<string, string> = {
  "jobs:read": "read jobs",
  "jobs:write": "write jobs",
  "cost-codes:read": "read cost codes",
  "reports:read": "read financial reports",
  "leads:read": "read leads",
  "leads:write": "write leads",
  "proposals:read": "read proposals",
  "proposals:write": "draft proposals",
  "files:read": "read files/photos",
  "files:write": "write files/photos",
  "bills:read": "read bills",
  "bills:write": "write bills",
  "invoices:read": "read invoices",
  "invoices:write": "write invoices",
};

const FULL_ACCESS_LABEL = "full WCI OS API access (files, financials, jobs, …)";

/**
 * Connected applications — Claude, ChatGPT, or anything else someone has authorized
 * against /api/mcp.
 *
 * This page is the other half of the consent screen. That screen tells people they
 * can disconnect at any time from Settings, which is only true if there is somewhere
 * to do it; a permission granted with no visible way to take it back is not really a
 * permission, it is a one-way door.
 *
 * "Attribute API writes as" rebinds an existing OAuth grant to a bot ApiKey (heather /
 * atlas / roy) so Cursor MCP stops showing as "Cursor" without a reconnect.
 */
export default async function ConnectionsSettingsPage() {
  const user = await currentAppUserOrRedirect();
  const connections = await listConnections(user.organizationId);
  const isAdmin = user.role === UserRole.ADMIN;
  const botKeys = await db.apiKey.findMany({
    where: { organizationId: user.organizationId, revokedAt: null, agentKind: { not: null } },
    select: { id: true, name: true, agentKind: true },
    orderBy: { name: "asc" },
  });

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4 p-6">
      <div>
        <h1 className="text-xl font-semibold text-[var(--bt-text)]">Connected applications</h1>
        <p className="text-sm text-[var(--bt-muted)]">
          Assistants connected to WCI OS — Claude, ChatGPT, Heather MCP, or anything else someone has authorized. For
          bot MCP (Heather / Atlas / Roy), set <strong className="font-medium text-[var(--bt-text)]">Attribute API
          writes as</strong> to that bot&apos;s key so audit logs show <code>heather</code>, not{" "}
          <code>Cursor</code>. No Cursor reconnect needed after changing this.
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
              <th className="px-4 py-2 font-semibold">Approved by</th>
              <th className="px-4 py-2 font-semibold">Attribute writes as</th>
              <th className="px-4 py-2 font-semibold">Can</th>
              <th className="px-4 py-2 font-semibold">Connected</th>
              <th className="px-4 py-2 font-semibold">Last used</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody>
            {connections.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-[var(--bt-muted)]">
                  Nothing is connected yet. Add WCI OS as a custom connector in Claude or ChatGPT using{" "}
                  <code className="text-[var(--bt-text)]">/api/mcp</code> on this domain — or paste a bot API key as the
                  MCP Authorization bearer (preferred for Heather / Atlas / Roy).
                </td>
              </tr>
            ) : (
              connections.map((connection) => {
                const mine = connection.userId === user.id;
                const canEdit = mine || isAdmin;
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
                    <td className="px-4 py-3 text-[var(--bt-text)]">
                      {canEdit && botKeys.length > 0 ? (
                        <form action={setConnectionActingApiKey} className="flex items-center gap-2">
                          <input type="hidden" name="oauthClientId" value={connection.oauthClientId} />
                          <input type="hidden" name="userId" value={connection.userId} />
                          <select
                            name="actingApiKeyId"
                            defaultValue={connection.actingApiKeyId ?? ""}
                            className="max-w-[11rem] rounded border bg-transparent px-2 py-1 text-xs"
                            style={{ borderColor: "var(--bt-border)" }}
                          >
                            <option value="">None ({connection.clientName})</option>
                            {botKeys.map((key) => (
                              <option key={key.id} value={key.id}>
                                {key.name}
                              </option>
                            ))}
                          </select>
                          <button type="submit" className="text-xs text-[var(--bt-accent,#1f6feb)] hover:underline">
                            Save
                          </button>
                        </form>
                      ) : (
                        <span className="text-xs">
                          {connection.actingApiKeyName ?? (
                            <span className="text-[var(--bt-muted)]">{connection.clientName} only</span>
                          )}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-[var(--bt-muted)]">
                      {connection.scopes.length >= MCP_GRANTABLE_SCOPES.length
                        ? FULL_ACCESS_LABEL
                        : connection.scopes.map((scope) => SCOPE_DESCRIPTIONS[scope] ?? scope).join(", ")}
                    </td>
                    <td className="px-4 py-3 text-[var(--bt-muted)]">{formatDate(connection.connectedAt)}</td>
                    <td className="px-4 py-3 text-[var(--bt-muted)]">
                      {connection.lastUsedAt ? formatDate(connection.lastUsedAt) : "never"}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {canEdit ? (
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
        would have expired. Reconnecting is the same approval screen again. Changing &quot;Attribute writes as&quot;
        updates live tokens immediately (no reconnect).
      </p>
    </div>
  );
}
