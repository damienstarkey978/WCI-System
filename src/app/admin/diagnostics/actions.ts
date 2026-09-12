"use server";

import { revalidatePath } from "next/cache";

import { requireRole } from "@/lib/auth";
import { UserRole } from "@/generated/prisma/enums";
import { fixCostCodes } from "@/lib/cost-codes/diagnostics";
import { deleteTestRecordsByEmail } from "@/lib/admin/test-data-cleanup";
import { runJarvis403Isolation, type Jarvis403CheckResult } from "@/lib/jarvis/diagnostics";

export interface Jarvis403ActionState {
  readonly results?: readonly Jarvis403CheckResult[];
  readonly ranAt?: string;
  readonly error?: string;
}

/** Real Anthropic API calls — costs a little and takes a few seconds, so this is a
 *  button a human clicks, never something that runs on page load. */
export async function runJarvis403CheckAction(_previous: Jarvis403ActionState, _formData: FormData): Promise<Jarvis403ActionState> {
  await requireRole(UserRole.ADMIN);
  try {
    const results = await runJarvis403Isolation();
    return { results, ranAt: new Date().toISOString() };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

export interface CostCodeFixActionState {
  readonly summary?: string;
  readonly error?: string;
}

/** Real writes — only runs from an explicit confirm click, never automatically. */
export async function runCostCodeFixAction(_previous: CostCodeFixActionState, _formData: FormData): Promise<CostCodeFixActionState> {
  const user = await requireRole(UserRole.ADMIN);
  try {
    const result = await fixCostCodes(user.organizationId, { dryRun: false });
    revalidatePath("/admin/diagnostics");
    revalidatePath("/admin/cost-codes");
    const parts = [`${result.fixedCount} code/type fix(es)`, `${result.parentsFixedCount} parent link(s)`, `${result.alreadyCorrectCount} already correct`];
    if (result.notFoundNames.length > 0) parts.push(`${result.notFoundNames.length} canonical name(s) not found — need creating by hand`);
    if (result.unmatchedLiveRows.length > 0) parts.push(`${result.unmatchedLiveRows.length} live row(s) not in the canonical list — left untouched`);
    return { summary: parts.join(", ") + "." };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

export interface DeleteTestLeadActionState {
  readonly summary?: string;
  readonly error?: string;
}

const TEST_JARVIS_PHOTOQA_EMAIL = "test-jarvis-photoqa@example.com";

export async function deleteTestJarvisPhotoQaLeadAction(_previous: DeleteTestLeadActionState, _formData: FormData): Promise<DeleteTestLeadActionState> {
  await requireRole(UserRole.ADMIN);
  try {
    const { deletedLeads, deletedClients } = await deleteTestRecordsByEmail(TEST_JARVIS_PHOTOQA_EMAIL);
    revalidatePath("/admin/diagnostics");
    return { summary: `Deleted ${deletedLeads} lead(s) and ${deletedClients} client(s) for ${TEST_JARVIS_PHOTOQA_EMAIL}.` };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}
