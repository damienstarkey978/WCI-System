/**
 * GET /oauth/authorize — the one screen a person sees when connecting an outside
 * assistant to WCI OS.
 *
 * It exists to answer three questions before anything is granted: which application
 * is asking, what it will be able to do, and whose data it will act on. A consent
 * screen that does not say those plainly is a formality, and a formality is what
 * people click through.
 *
 * Deliberately not part of the staff shell. This page is reached from another
 * application's flow, and surrounding it with navigation invites someone to wander off
 * mid-authorization and leave the client waiting on a callback that never arrives.
 */

import { redirect } from "next/navigation";

import { currentAppUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { OAuthError, MCP_GRANTABLE_SCOPES, validateAuthorizationRequest } from "@/lib/oauth/service";
import type { Scope } from "@/lib/api-scopes";

import { approveAuthorization, denyAuthorization } from "./actions";

export const dynamic = "force-dynamic";

/** Plain-language descriptions. A scope name means nothing to the person approving it. */
const SCOPE_DESCRIPTIONS: Record<string, string> = {
  "jobs:read": "See your jobs and their addresses, status, and contract type",
  "jobs:write": "Create and update jobs",
  "cost-codes:read": "See your cost code catalog",
  "cost-codes:write": "Create and update cost codes",
  "reports:read": "See your financial reports — profitability, WIP, cash flow, and the daily brief",
  "leads:read": "See your sales leads and their contact details",
  "leads:write": "Create and update sales leads",
  "proposals:read": "See your proposals and what they are priced at",
  "proposals:write": "Draft and update proposals",
  "files:read": "See job files, photos, and documents",
  "files:write": "Upload and update job files, photos, and documents",
  "daily-logs:read": "See daily logs",
  "daily-logs:write": "Create and update daily logs",
  "bills:read": "See bills and AP",
  "bills:write": "Create and update bills",
  "invoices:read": "See invoices",
  "invoices:write": "Create and update invoices",
  "purchase-orders:read": "See purchase orders",
  "purchase-orders:write": "Create and update purchase orders",
  "schedule:read": "See the job schedule",
  "schedule:write": "Create and update schedule items",
};

const FULL_ACCESS_SUMMARY =
  "Read and write every WCI OS data point this organization exposes over the API — jobs, files/photos/documents, financials, schedule, logs, CRM, permitting, and the rest of the catalog (historical migration tools excluded).";

interface PageProps {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function single(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

function Problem({ title, detail }: { title: string; detail: string }) {
  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col justify-center gap-3 px-4 py-12">
      <h1 className="text-lg font-semibold text-[var(--bt-text)]">{title}</h1>
      <p className="text-sm text-[var(--bt-muted)]">{detail}</p>
      <p className="text-sm text-[var(--bt-muted)]">
        Nothing has been granted. Start the connection again from the application that sent you here.
      </p>
    </main>
  );
}

export default async function AuthorizePage({ searchParams }: PageProps) {
  const params = await searchParams;

  // Signed in first: the whole point is to attach the grant to a named person, and
  // there is nothing to show until we know who that is.
  //
  // Not currentAppUserOrRedirect() — that drops the caller at /sign-in with no way
  // back, and this request cannot survive that. Every parameter the client sent lives
  // in this URL, so signing in has to return to this exact URL or the connector is
  // left waiting on a callback that will never come. Which is how it would fail for
  // everyone who is not already signed in, meaning almost everyone connecting for the
  // first time.
  const user = await currentAppUser();
  if (!user) {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (typeof value === "string") query.set(key, value);
    }
    redirect(`/sign-in?redirect_url=${encodeURIComponent(`/oauth/authorize?${query.toString()}`)}`);
  }

  const clientId = single(params.client_id);
  const redirectUri = single(params.redirect_uri);
  const state = single(params.state);
  const codeChallenge = single(params.code_challenge);
  const codeChallengeMethod = single(params.code_challenge_method);
  const requestedScopes = single(params.scope).split(/\s+/).filter(Boolean) as Scope[];

  if (single(params.response_type) !== "code") {
    return <Problem title="This connection request isn't supported" detail="WCI OS only issues authorization codes (response_type=code)." />;
  }

  let client: { id: string; name: string; clientUri: string | null };
  let grantedScopes: readonly Scope[];
  try {
    const validated = await validateAuthorizationRequest({
      clientId,
      redirectUri,
      scopes: requestedScopes,
      codeChallenge,
      codeChallengeMethod,
    });
    client = validated.client;
    grantedScopes = validated.grantedScopes;
  } catch (error) {
    // Rendered here rather than redirected: a request this broken usually means a
    // misconfigured client, and bouncing it back to an unverified redirect would be
    // both useless to the person and a way to send them somewhere unintended.
    return (
      <Problem
        title="This connection request isn't valid"
        detail={error instanceof OAuthError ? error.message : "The request could not be verified."}
      />
    );
  }

  const organization = await db.organization.findUnique({
    where: { id: user.organizationId },
    select: { name: true },
  });

  // Bot keys the grant can attribute as. Prefer heather/atlas/roy so Cursor MCP
  // writes show that name instead of the OAuth client label ("Cursor").
  const botKeys = await db.apiKey.findMany({
    where: { organizationId: user.organizationId, revokedAt: null, agentKind: { not: null } },
    select: { id: true, name: true, agentKind: true, tokenId: true },
    orderBy: { name: "asc" },
  });
  const preferredHeather = botKeys.find((key) => key.name === "heather") ?? null;

  const formFields = (
    <>
      <input type="hidden" name="client_id" value={clientId} />
      <input type="hidden" name="redirect_uri" value={redirectUri} />
      <input type="hidden" name="state" value={state} />
      <input type="hidden" name="scope" value={grantedScopes.join(" ")} />
      <input type="hidden" name="code_challenge" value={codeChallenge} />
      <input type="hidden" name="code_challenge_method" value={codeChallengeMethod} />
    </>
  );

  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col justify-center gap-6 px-4 py-12">
      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-[var(--bt-muted)]">Connect an application</p>
        <h1 className="text-xl font-semibold text-[var(--bt-text)]">
          {client.name} wants to connect to WCI OS
        </h1>
        <p className="text-sm text-[var(--bt-muted)]">
          Approved by <strong className="text-[var(--bt-text)]">{user.name || user.email}</strong>
          {organization ? <> for <strong className="text-[var(--bt-text)]">{organization.name}</strong></> : null}.
          Choose which bot API key API writes should attribute as (required for Heather / Atlas / Roy MCP).
        </p>
      </div>

      <div className="rounded border" style={{ borderColor: "var(--bt-border)" }}>
        <div className="border-b px-4 py-2" style={{ borderColor: "var(--bt-border)" }}>
          <span className="text-xs font-semibold uppercase tracking-wide text-[var(--bt-muted)]">
            What it will be able to do
          </span>
        </div>
        <ul className="space-y-2 px-4 py-3">
          {grantedScopes.length >= MCP_GRANTABLE_SCOPES.length ? (
            <li className="text-sm text-[var(--bt-text)]">{FULL_ACCESS_SUMMARY}</li>
          ) : (
            grantedScopes.map((scope) => (
              <li key={scope} className="text-sm text-[var(--bt-text)]">
                {SCOPE_DESCRIPTIONS[scope] ?? scope}
              </li>
            ))
          )}
        </ul>
      </div>

      <p className="text-sm text-[var(--bt-muted)]">
        It acts with the scopes above through the agent API — including files/photos and financial records when those
        scopes are granted. You can disconnect it at any time under Settings → Connected applications.
      </p>

      <div className="flex gap-3">
        <form action={approveAuthorization} className="flex flex-1 flex-col gap-3">
          {formFields}
          {botKeys.length > 0 ? (
            <label className="flex flex-col gap-1 text-sm text-[var(--bt-text)]">
              <span className="text-xs font-semibold uppercase tracking-wide text-[var(--bt-muted)]">
                Attribute API writes as
              </span>
              <select
                name="acting_api_key_id"
                defaultValue={preferredHeather?.id ?? botKeys[0]?.id ?? ""}
                className="rounded border bg-transparent px-3 py-2 text-sm"
                style={{ borderColor: "var(--bt-border)" }}
              >
                {botKeys.map((key) => (
                  <option key={key.id} value={key.id}>
                    {key.name}
                    {key.agentKind ? ` (${key.agentKind})` : ""}
                  </option>
                ))}
                <option value="">No bot key — use “{client.name}” only</option>
              </select>
            </label>
          ) : null}
          <button
            type="submit"
            className="w-full rounded px-4 py-2 text-sm font-semibold text-white"
            style={{ background: "var(--bt-accent, #1f6feb)" }}
          >
            Connect {client.name}
          </button>
        </form>
        <form action={denyAuthorization} className="flex flex-1 flex-col justify-end">
          {formFields}
          <button
            type="submit"
            className="w-full rounded border px-4 py-2 text-sm font-semibold text-[var(--bt-text)]"
            style={{ borderColor: "var(--bt-border)" }}
          >
            Cancel
          </button>
        </form>
      </div>

      {client.clientUri ? (
        <p className="text-xs text-[var(--bt-muted)]">
          This application identifies itself as {client.clientUri}. If you do not recognise it, cancel.
        </p>
      ) : null}
    </main>
  );
}
