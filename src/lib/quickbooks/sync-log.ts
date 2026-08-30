/**
 * QboSyncLog writer — CLAUDE.md 2.3: "a sync-log table so a failed push is visible and
 * retryable rather than silently dropped." One row per attempt, not per record; sync
 * functions call this in both the success and failure path so every attempt is visible.
 */

import { db } from "@/lib/db";
import type { QboSyncDirection, QboSyncEntityType } from "@/generated/prisma/enums";

export interface RecordSyncAttemptInput {
  readonly organizationId: string;
  readonly entityType: QboSyncEntityType;
  readonly direction: QboSyncDirection;
  readonly wciRecordId: string;
  readonly qboId?: string;
  readonly error?: unknown;
}

export function recordSyncAttempt(input: RecordSyncAttemptInput): Promise<unknown> {
  return db.qboSyncLog.create({
    data: {
      organizationId: input.organizationId,
      entityType: input.entityType,
      direction: input.direction,
      wciRecordId: input.wciRecordId,
      qboId: input.qboId,
      status: input.error ? "FAILED" : "SUCCESS",
      errorMessage: input.error ? (input.error instanceof Error ? input.error.message : String(input.error)) : undefined,
    },
  });
}
