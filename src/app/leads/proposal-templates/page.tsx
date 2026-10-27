import { SetupNotice } from "@/app/admin/setup-notice";
import { CreateModal } from "@/components/shell/CreateModal";
import { EmptyState } from "@/components/shell/EmptyState";
import { DocumentIcon } from "@/components/shell/icons";
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
  const createAction = (
    <CreateModal triggerLabel="+ Template" title="New proposal template">
      <TemplateForm />
    </CreateModal>
  );

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-3 p-4 sm:gap-4 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-[var(--bt-text)]">Proposal Templates</h1>
          <p className="text-sm text-[var(--bt-muted)]">Reusable cover message, scope sections and payment schedule. Pricing always comes from the estimate.</p>
        </div>
        {createAction}
      </div>

      {templates.length === 0 ? (
        <EmptyState
          icon={<DocumentIcon className="h-10 w-10" />}
          title="No proposal templates yet"
          description="Save cover copy, scope sections, and a payment schedule once — apply them to any draft proposal."
          action={createAction}
        />
      ) : (
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
      )}
    </div>
  );
}
