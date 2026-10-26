/**
 * Org-level AI preference instructions (Handoff Settings → Presets written rules).
 * These are the company cost/estimating/proposal instructions Jarvis reads when
 * drafting estimates and proposals — imported from a real Handoff export, never invented.
 */

import { db } from "@/lib/db";
import type { AiPreferenceForType } from "@/generated/prisma/enums";

export interface AiPreferenceInstructionRow {
  readonly id: string;
  readonly label: string | null;
  readonly instruction: string;
  readonly forType: AiPreferenceForType;
  readonly enabled: boolean;
  readonly appliesToChangeOrder: boolean;
}

export async function listEnabledAiPreferenceInstructions(
  organizationId: string,
  options?: {
    readonly forTypes?: readonly AiPreferenceForType[];
    /** When true, also include any enabled instruction flagged appliesToChangeOrder. */
    readonly forChangeOrder?: boolean;
  },
): Promise<readonly AiPreferenceInstructionRow[]> {
  const forTypes = options?.forTypes;
  const forChangeOrder = options?.forChangeOrder === true;

  const typeOrChangeClauses: Array<
    { forType: { in: AiPreferenceForType[] } } | { appliesToChangeOrder: true }
  > = [];
  if (forTypes && forTypes.length > 0) {
    typeOrChangeClauses.push({ forType: { in: [...forTypes] } });
  }
  if (forChangeOrder) {
    typeOrChangeClauses.push({ appliesToChangeOrder: true });
  }

  const rows = await db.aiPreferenceInstruction.findMany({
    where: {
      organizationId,
      enabled: true,
      ...(typeOrChangeClauses.length > 0 ? { OR: typeOrChangeClauses } : {}),
    },
    orderBy: [{ forType: "asc" }, { sortOrder: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      label: true,
      instruction: true,
      forType: true,
      enabled: true,
      appliesToChangeOrder: true,
    },
  });

  return rows;
}

/** Format enabled instructions for inclusion in an Anthropic system/user prompt. */
export function formatAiPreferenceInstructions(
  instructions: readonly AiPreferenceInstructionRow[],
): string {
  if (instructions.length === 0) {
    return "(none configured)";
  }
  return instructions
    .map((row, index) => {
      const title = row.label?.trim() || `Instruction ${index + 1}`;
      const scope =
        row.forType === "ESTIMATE" && row.appliesToChangeOrder
          ? `${row.forType} (+ change orders)`
          : row.forType;
      return `${index + 1}. [${scope}] ${title}\n${row.instruction.trim()}`;
    })
    .join("\n\n");
}
