/**
 * Org wide custom fields for the Job Info page. Definitions are rows; each job's values
 * sit in Job.customFields as "cf_<definition id>" (see updateJobDetails). Pure helpers
 * are exported separately so the form and the tests do not need a database.
 */

import type { JobCustomFieldType } from "@/generated/prisma/enums";
import { db } from "@/lib/db";

export class CustomFieldNameTakenError extends Error {
  constructor(name: string) {
    super(`A custom field named "${name}" already exists.`);
    this.name = "CustomFieldNameTakenError";
  }
}

export function customFieldValueOf(customFields: unknown, definitionId: string): string | boolean | null {
  if (typeof customFields !== "object" || customFields === null || Array.isArray(customFields)) return null;
  const value = (customFields as Record<string, unknown>)[`cf_${definitionId}`];
  return typeof value === "string" || typeof value === "boolean" ? value : null;
}

/** Reads the submitted form: a checkbox is true when present, text is trimmed and empty text is kept as "" so it can clear a value. */
export function parseCustomFieldValues(
  definitions: readonly { id: string; type: JobCustomFieldType }[],
  read: (key: string) => FormDataEntryValue | null,
): Record<string, string | boolean> {
  const values: Record<string, string | boolean> = {};
  for (const definition of definitions) {
    const raw = read(`cf_${definition.id}`);
    values[definition.id] = definition.type === "CHECKBOX" ? raw !== null : String(raw ?? "").trim();
  }
  return values;
}

export async function listJobCustomFields(organizationId: string) {
  return db.jobCustomFieldDef.findMany({ where: { organizationId }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] });
}

export async function createJobCustomField(organizationId: string, rawName: string, type: JobCustomFieldType) {
  const name = rawName.replace(/\s+/g, " ").trim();
  if (!name) throw new Error("Field name is required.");
  const taken = await db.jobCustomFieldDef.findFirst({ where: { organizationId, name: { equals: name, mode: "insensitive" } }, select: { id: true } });
  if (taken) throw new CustomFieldNameTakenError(name);
  const last = await db.jobCustomFieldDef.findFirst({ where: { organizationId }, orderBy: { sortOrder: "desc" }, select: { sortOrder: true } });
  return db.jobCustomFieldDef.create({ data: { organizationId, name, type, sortOrder: (last?.sortOrder ?? -1) + 1 } });
}
