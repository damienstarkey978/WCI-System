import { SetupNotice } from "@/app/admin/setup-notice";
import { CreateModal } from "@/components/shell/CreateModal";
import { currentAppUserOrRedirect } from "@/lib/auth";
import { readTemplateDraws, readTemplateSections } from "@/lib/proposal-templates/content";
import { listProposalTemplates } from "@/lib/proposal-templates/service";

import { TemplateForm } from "./template-form";
import { TemplatesGrid } from "./templates-grid";

export const dynamic = "force-dynamic";

export default async function ProposalTemplatesPage() {
  let user;
  try {
    user = await currentAppUserOrRedirect();
  } catch (error) {
    return <SetupNotice detail={error instanceof Error ? error.message : String(error)} />;
  }

  const templates = await listProposalTemplates(user.organizationId);

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4 p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-[var(--bt-text)]">Proposal templates</h1>
          <p className="text-sm text-[var(--bt-muted)]">Reusable cover message, scope sections and payment schedule. Pricing always comes from the estimate.</p>
        </div>
        <CreateModal triggerLabel="+ Template" title="New proposal template">
          <TemplateForm />
        </CreateModal>
      </div>

      <TemplatesGrid
        rows={templates.map((template) => ({
          id: template.id,
          name: template.name,
          description: template.description,
          sectionCount: readTemplateSections(template.sections).length,
          drawCount: readTemplateDraws(template.draws).length,
          updatedAt: template.updatedAt.toISOString(),
        }))}
      />
    </div>
  );
}
