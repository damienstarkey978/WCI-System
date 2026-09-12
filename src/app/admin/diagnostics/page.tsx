import { AuthConfigurationError, requireRole } from "@/lib/auth";
import { UserRole } from "@/generated/prisma/enums";
import { diagnoseCostCodes } from "@/lib/cost-codes/diagnostics";
import { findTestRecordsByEmail } from "@/lib/admin/test-data-cleanup";

import { SetupNotice } from "../setup-notice";
import { CostCodeFixButton, DeleteTestLeadButton, JarvisIsolationPanel } from "./diagnostics-panels";

export const dynamic = "force-dynamic";

const TEST_JARVIS_PHOTOQA_EMAIL = "test-jarvis-photoqa@example.com";

const PANEL = "rounded-lg border border-black/10 p-4 dark:border-white/15";

/**
 * Browser-clickable versions of the production-troubleshooting scripts in scripts/
 * (verify-jarvis-403.mts, diagnose-cost-codes.mts / fix-cost-code-codes.mts,
 * delete-test-jarvis-photoqa-lead.mts) — for whenever a terminal + checked-out repo
 * + .env isn't available. Every action here shares its exact logic with the
 * matching script (src/lib/cost-codes/diagnostics.ts, src/lib/jarvis/diagnostics.ts,
 * src/lib/admin/test-data-cleanup.ts) — one implementation, two ways to run it.
 */
export default async function DiagnosticsPage() {
  let user;
  try {
    user = await requireRole(UserRole.ADMIN);
  } catch (error) {
    if (error instanceof AuthConfigurationError) return <SetupNotice detail={error.message} />;
    throw error;
  }

  const [costCodeReport, testRecords] = await Promise.all([
    diagnoseCostCodes(user.organizationId),
    findTestRecordsByEmail(TEST_JARVIS_PHOTOQA_EMAIL),
  ]);

  return (
    <>
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Diagnostics</h1>
        <p className="mt-1 text-sm text-black/60 dark:text-white/60">
          Production troubleshooting tools that used to require a terminal — click to run instead.
        </p>
      </div>

      <JarvisIsolationPanel />

      <div className={PANEL}>
        <h2 className="text-sm font-semibold">Cost code catalog</h2>
        <p className="mt-1 text-xs text-black/60 dark:text-white/60">
          {costCodeReport.organizationName} — {costCodeReport.totalCount} cost codes.
        </p>
        <dl className="mt-3 grid grid-cols-3 gap-3 text-sm">
          <div>
            <dt className="text-xs text-black/50 dark:text-white/50">code === name</dt>
            <dd className={costCodeReport.codeEqualsNameCount > 0 ? "font-semibold text-red-600" : "font-semibold"}>
              {costCodeReport.codeEqualsNameCount}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-black/50 dark:text-white/50">code is blank</dt>
            <dd className={costCodeReport.blankCodeCount > 0 ? "font-semibold text-red-600" : "font-semibold"}>{costCodeReport.blankCodeCount}</dd>
          </div>
          <div>
            <dt className="text-xs text-black/50 dark:text-white/50">looks canonical</dt>
            <dd className="font-semibold">{costCodeReport.canonicalLookingCount}</dd>
          </div>
        </dl>

        {costCodeReport.codeEqualsNameRows.length > 0 ? (
          <div className="mt-3 max-h-48 overflow-y-auto rounded border border-black/10 font-mono text-xs dark:border-white/15">
            {costCodeReport.codeEqualsNameRows.map((row) => (
              <div key={row.id} className="border-b border-black/5 px-2 py-1 last:border-0 dark:border-white/10">
                {row.id} — code={JSON.stringify(row.code)} name={JSON.stringify(row.name)}
              </div>
            ))}
          </div>
        ) : null}

        <p className="mt-3 text-xs text-black/60 dark:text-white/60">
          {costCodeReport.looksBad
            ? 'If "code === name" or "code is blank" accounts for most/all rows, the fix below repairs codes and parent links in place — no row\'s id changes, so every already-imported Estimate/PO/Bill/Budget line stays pointed at the right cost code.'
            : "Nothing looks wrong here — the fix button below is disabled."}
        </p>

        <CostCodeFixButton looksBad={costCodeReport.looksBad} />
      </div>

      <div className={PANEL}>
        <h2 className="text-sm font-semibold">Test data cleanup</h2>
        <p className="mt-1 text-xs text-black/60 dark:text-white/60">
          The &quot;TEST Jarvis PhotoQA&quot; client/lead created during photo-path QA on the Jarvis hang fix (
          {TEST_JARVIS_PHOTOQA_EMAIL}).
        </p>
        {testRecords.leads.length > 0 || testRecords.clients.length > 0 ? (
          <div className="mt-3 flex flex-col gap-1 font-mono text-xs">
            {testRecords.leads.map((lead) => (
              <div key={lead.id}>
                Lead {lead.id} | {lead.name} | {lead.email}
              </div>
            ))}
            {testRecords.clients.map((client) => (
              <div key={client.id}>
                Client {client.id} | {client.name} | {client.email}
              </div>
            ))}
          </div>
        ) : null}
        <DeleteTestLeadButton hasRecords={testRecords.leads.length > 0 || testRecords.clients.length > 0} />
      </div>
    </>
  );
}
