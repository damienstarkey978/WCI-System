import Link from "next/link";
import { notFound } from "next/navigation";

import { SetupNotice } from "@/app/admin/setup-notice";
import { currentAppUserOrRedirect } from "@/lib/auth";
import { drawsToText, readTemplateDraws, readTemplateSections, sectionsToText } from "@/lib/proposal-templates/content";
import { getProposalTemplate, ProposalTemplateNotFoundError } from "@/lib/proposal-templates/service";

import { deleteTemplateAction } from "../actions";
import { TemplateForm } from "../template-form";

export const dynamic = "force-dynamic";

export default async function ProposalTemplatePage({ params }: PageProps<"/leads/proposal-templates/[templateId]">) {
  const { templateId } = await params;

  let user;
  try {
    user = await currentAppUserOrRedirect();
  } catch (error) {
    return <SetupNotice detail={error instanceof Error ? error.message : String(error)} />;
  }

  let template;
  try {
    template = await getProposalTemplate(user.organizationId, templateId);
  } catch (error) {
    if (error instanceof ProposalTemplateNotFoundError) notFound();
    throw error;
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4 p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/leads/proposal-templates" className="text-xs text-[var(--bt-primary)] hover:underline">
            ← Proposal templates
          </Link>
          <h1 className="text-xl font-semibold text-[var(--bt-text)]">{template.name}</h1>
        </div>
        <form action={deleteTemplateAction}>
          <input type="hidden" name="templateId" value={template.id} />
          <button type="submit" className="text-xs text-[var(--bt-muted)] hover:text-red-600 hover:underline">
            Delete template
          </button>
        </form>
      </div>

      <div className="rounded-lg border bg-[var(--bt-panel-bg)] p-4" style={{ borderColor: "var(--bt-border)" }}>
        <TemplateForm
          values={{
            id: template.id,
            name: template.name,
            description: template.description ?? "",
            coverMessage: template.coverMessage ?? "",
            sectionsText: sectionsToText(readTemplateSections(template.sections)),
            drawsText: drawsToText(readTemplateDraws(template.draws)),
          }}
        />
      </div>
    </div>
  );
}
