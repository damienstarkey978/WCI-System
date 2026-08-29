import { SetupNotice } from "@/app/admin/setup-notice";
import { UserRole } from "@/generated/prisma/enums";
import { listApiKeys } from "@/lib/api-keys/service";
import { requireRole } from "@/lib/auth";
import { formatDate } from "@/lib/format";

import { CreateKeyForm } from "./create-key-form";
import { RevokeButton } from "./revoke-button";

export const dynamic = "force-dynamic";

function isKeyExpired(expiresAt: Date | null): boolean {
  return expiresAt !== null && expiresAt.getTime() <= Date.now();
}

/**
 * Admin-only key management for the machine API (src/lib/api-auth.ts). This is the
 * only way to mint a token without touching the database directly — a hard prerequisite
 * for MCP Connection (Claude Desktop, ChatGPT, or any other MCP client authenticating
 * as this org against /api/mcp) and for any other external integration.
 */
export default async function ApiKeysSettingsPage() {
  let admin;
  try {
    admin = await requireRole(UserRole.ADMIN);
  } catch (error) {
    return <SetupNotice detail={error instanceof Error ? error.message : String(error)} />;
  }

  const keys = await listApiKeys(admin.organizationId);

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4 p-6">
      <div>
        <h1 className="text-xl font-semibold text-[var(--bt-text)]">API keys</h1>
        <p className="text-sm text-[var(--bt-muted)]">
          Keys for connecting external tools and agents to WCI OS — including MCP clients like Claude Desktop or ChatGPT.
          A key acts as this organization with exactly the scopes you grant it; nothing more.
        </p>
      </div>

      <CreateKeyForm />

      <div className="rounded-lg border bg-[var(--bt-panel-bg)]" style={{ borderColor: "var(--bt-border)" }}>
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b text-xs uppercase tracking-wide text-[var(--bt-muted)]" style={{ borderColor: "var(--bt-border)" }}>
              <th className="px-4 py-2 font-semibold">Name</th>
              <th className="px-4 py-2 font-semibold">Token ID</th>
              <th className="px-4 py-2 font-semibold">Scopes</th>
              <th className="px-4 py-2 font-semibold">Last used</th>
              <th className="px-4 py-2 font-semibold">Expires</th>
              <th className="px-4 py-2 font-semibold">Status</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody>
            {keys.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-[var(--bt-muted)]">
                  No API keys yet.
                </td>
              </tr>
            ) : (
              keys.map((key) => {
                const isRevoked = key.revokedAt !== null;
                const isExpired = isKeyExpired(key.expiresAt);
                return (
                  <tr key={key.id} className="border-b last:border-0" style={{ borderColor: "var(--bt-border)" }}>
                    <td className="px-4 py-2">
                      <div className="font-medium text-[var(--bt-text)]">{key.name}</div>
                      {key.agentKind ? <div className="text-xs text-[var(--bt-muted)]">{key.agentKind}</div> : null}
                    </td>
                    <td className="px-4 py-2 font-mono text-xs text-[var(--bt-muted)]">{key.tokenId}</td>
                    <td className="px-4 py-2 text-xs text-[var(--bt-muted)]">
                      {key.scopes.length > 3 ? `${key.scopes.slice(0, 3).join(", ")} +${key.scopes.length - 3} more` : key.scopes.join(", ")}
                    </td>
                    <td className="px-4 py-2 text-xs text-[var(--bt-muted)]">
                      {key.lastUsedAt ? formatDate(key.lastUsedAt) : "Never"}
                    </td>
                    <td className="px-4 py-2 text-xs text-[var(--bt-muted)]">{key.expiresAt ? formatDate(key.expiresAt) : "Never"}</td>
                    <td className="px-4 py-2">
                      {isRevoked ? (
                        <span className="text-xs font-semibold text-red-600">Revoked</span>
                      ) : isExpired ? (
                        <span className="text-xs font-semibold text-amber-600">Expired</span>
                      ) : (
                        <span className="text-xs font-semibold text-emerald-700">Active</span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-right">{!isRevoked ? <RevokeButton apiKeyId={key.id} name={key.name} /> : null}</td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
