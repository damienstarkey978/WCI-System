/**
 * Proposal templates: reusable cover message + narrative sections + payment
 * schedule (no pricing; see the ProposalTemplate schema comment). Applying one to a
 * DRAFT proposal lives in src/lib/proposals/service.ts (applyProposalTemplate) since
 * it needs that module's editable-proposal guard.
 */

import { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";

import type { ProposalTemplateContent } from "./content";

export class ProposalTemplateNotFoundError extends Error {
  constructor(templateId: string) {
    super(`Proposal template ${templateId} not found`);
    this.name = "ProposalTemplateNotFoundError";
  }
}

export async function listProposalTemplates(organizationId: string) {
  return db.proposalTemplate.findMany({ where: { organizationId }, orderBy: { name: "asc" } });
}

export async function getProposalTemplate(organizationId: string, templateId: string) {
  const template = await db.proposalTemplate.findFirst({ where: { id: templateId, organizationId } });
  if (!template) throw new ProposalTemplateNotFoundError(templateId);
  return template;
}

function toData(content: ProposalTemplateContent) {
  return {
    name: content.name,
    description: content.description ?? null,
    coverMessage: content.coverMessage ?? null,
    sections: content.sections as unknown as Prisma.InputJsonValue,
    draws: content.draws as unknown as Prisma.InputJsonValue,
  };
}

export async function createProposalTemplate(organizationId: string, content: ProposalTemplateContent) {
  return db.proposalTemplate.create({ data: { organizationId, ...toData(content) } });
}

export async function updateProposalTemplate(organizationId: string, templateId: string, content: ProposalTemplateContent) {
  await getProposalTemplate(organizationId, templateId);
  return db.proposalTemplate.update({ where: { id: templateId }, data: toData(content) });
}

export async function deleteProposalTemplate(organizationId: string, templateId: string) {
  await getProposalTemplate(organizationId, templateId);
  await db.proposalTemplate.delete({ where: { id: templateId } });
}
