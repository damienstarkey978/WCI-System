import { EmptyState } from "@/components/shell/EmptyState";
import { currentAppUser } from "@/lib/auth";
import { listMaterialCatalogItems } from "@/lib/materials/service";
import { SetupNotice } from "@/app/admin/setup-notice";

import { CreateMaterialForm } from "./create-material-form";
import { MaterialRow } from "./material-row";

export const dynamic = "force-dynamic";

export default async function MaterialsPage() {
  let user;
  try {
    user = await currentAppUser();
  } catch (error) {
    return <SetupNotice detail={error instanceof Error ? error.message : String(error)} />;
  }
  if (!user) {
    return <SetupNotice detail="No organization found. Seed the database, then reload." />;
  }

  const items = await listMaterialCatalogItems(user.organizationId);

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-4 p-6">
      <div>
        <h1 className="text-xl font-semibold text-[var(--bt-text)]">Materials catalog</h1>
        <p className="mt-1 text-sm text-[var(--bt-muted)]">
          The AI estimate assistant prices materials from this catalog first. Keep it current with what you&apos;re
          actually paying at Lowe&apos;s and Home Depot.
        </p>
      </div>

      <CreateMaterialForm />

      {items.length === 0 ? (
        <EmptyState title="No materials yet" description="Materials you add will be used to price AI-drafted estimates." />
      ) : (
        <div className="overflow-hidden rounded-lg border bg-white" style={{ borderColor: "var(--bt-border)" }}>
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b text-xs font-semibold uppercase tracking-wide text-[var(--bt-muted)]" style={{ borderColor: "var(--bt-border)" }}>
                <th className="px-4 py-3">Vendor</th>
                <th className="px-4 py-3">Description</th>
                <th className="px-4 py-3">Category</th>
                <th className="px-4 py-3">Price</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <MaterialRow key={item.id} item={item} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
