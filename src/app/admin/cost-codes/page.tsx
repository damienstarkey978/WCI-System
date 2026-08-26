import { currentAppUser } from "@/lib/auth";
import { db } from "@/lib/db";

import { SetupNotice } from "../setup-notice";
import { CreateCostCodeForm } from "./cost-code-form";

export const dynamic = "force-dynamic";

export default async function CostCodesPage() {
  let user;
  try {
    user = await currentAppUser();
  } catch (error) {
    return <SetupNotice detail={error instanceof Error ? error.message : String(error)} />;
  }

  if (!user) {
    return <SetupNotice detail="No organization found. Seed the database, then reload." />;
  }

  const costCodes = await db.costCode.findMany({
    where: { organizationId: user.organizationId },
    orderBy: [{ sortOrder: "asc" }, { code: "asc" }],
    include: { parent: { select: { code: true } } },
  });

  return (
    <>
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Cost codes</h1>
        <p className="mt-1 text-sm text-black/60 dark:text-white/60">
          The org-level catalog every estimate, PO and bill codes against.
        </p>
      </div>

      <CreateCostCodeForm />

      {costCodes.length === 0 ? (
        <p className="text-sm text-black/60 dark:text-white/60">
          No cost codes yet — run <code className="font-mono">npm run db:seed</code>.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-black/10 text-left text-xs uppercase tracking-wide text-black/50 dark:border-white/15 dark:text-white/50">
                <th className="py-2 pr-4 font-medium">Code</th>
                <th className="py-2 pr-4 font-medium">Name</th>
                <th className="py-2 pr-4 font-medium">Cost type</th>
                <th className="py-2 pr-4 font-medium">Parent</th>
              </tr>
            </thead>
            <tbody>
              {costCodes.map((costCode) => (
                <tr key={costCode.id} className="border-b border-black/5 dark:border-white/10">
                  <td className="py-2 pr-4 font-mono text-xs">{costCode.code}</td>
                  <td className="py-2 pr-4">{costCode.name}</td>
                  <td className="py-2 pr-4 text-xs text-black/60 dark:text-white/60">
                    {costCode.defaultCostType}
                  </td>
                  <td className="py-2 pr-4 font-mono text-xs text-black/50 dark:text-white/50">
                    {costCode.parent?.code ?? "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
