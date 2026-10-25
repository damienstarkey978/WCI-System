/**
 * Job messaging threads (Buildertrend's Messaging). A thread is a subject; its
 * messages are Comment rows with featureType "MessageThread". Messages posted before
 * threads existed sit on the job itself (featureType "Job") and are surfaced as the
 * "General" conversation, so nothing already written is lost or hidden.
 */

import { createComment } from "@/lib/comments/service";
import { db } from "@/lib/db";

export const THREAD_FEATURE_TYPE = "MessageThread";
export const LEGACY_JOB_FEATURE_TYPE = "Job";
export const GENERAL_THREAD_ID = "general";

export class MessageThreadNotFoundError extends Error {
  constructor(threadId: string) {
    super(`Conversation ${threadId} not found`);
    this.name = "MessageThreadNotFoundError";
  }
}

export function normalizeSubject(subject: string): string {
  return subject.replace(/\s+/g, " ").trim().slice(0, 200);
}

export async function createMessageThread(input: { organizationId: string; jobId: string; userId: string; subject: string; body: string }) {
  const subject = normalizeSubject(input.subject);
  const body = input.body.trim();
  if (!subject) throw new Error("Subject is required.");
  if (!body) throw new Error("Message can't be empty.");

  const job = await db.job.findFirst({ where: { id: input.jobId, organizationId: input.organizationId }, select: { id: true } });
  if (!job) throw new Error("Job not found.");

  const thread = await db.messageThread.create({
    data: { organizationId: input.organizationId, jobId: job.id, subject, startedByUserId: input.userId },
  });
  await createComment({ organizationId: input.organizationId, featureType: THREAD_FEATURE_TYPE, featureId: thread.id, authorUserId: input.userId, body });
  return thread;
}

/** Posts into a real thread, or into the legacy General stream when threadId is "general". */
export async function postThreadMessage(input: { organizationId: string; jobId: string; threadId: string; userId: string; body: string }) {
  const body = input.body.trim();
  if (!body) throw new Error("Message can't be empty.");

  if (input.threadId === GENERAL_THREAD_ID) {
    const job = await db.job.findFirst({ where: { id: input.jobId, organizationId: input.organizationId }, select: { id: true } });
    if (!job) throw new Error("Job not found.");
    return createComment({ organizationId: input.organizationId, featureType: LEGACY_JOB_FEATURE_TYPE, featureId: job.id, authorUserId: input.userId, body });
  }

  const thread = await db.messageThread.findFirst({ where: { id: input.threadId, jobId: input.jobId, organizationId: input.organizationId }, select: { id: true } });
  if (!thread) throw new MessageThreadNotFoundError(input.threadId);

  const comment = await createComment({ organizationId: input.organizationId, featureType: THREAD_FEATURE_TYPE, featureId: thread.id, authorUserId: input.userId, body });
  await db.messageThread.update({ where: { id: thread.id }, data: { lastMessageAt: new Date() } });
  return comment;
}

export interface ThreadSummary {
  readonly id: string;
  readonly subject: string;
  readonly lastMessageAt: Date;
  readonly messageCount: number;
  readonly preview: string;
}

export async function listThreadSummaries(organizationId: string, jobId: string): Promise<ThreadSummary[]> {
  const [threads, legacy] = await Promise.all([
    db.messageThread.findMany({ where: { organizationId, jobId }, orderBy: { lastMessageAt: "desc" } }),
    db.comment.findMany({ where: { organizationId, featureType: LEGACY_JOB_FEATURE_TYPE, featureId: jobId }, orderBy: { createdAt: "desc" }, select: { body: true, createdAt: true } }),
  ]);

  const counts = threads.length
    ? await db.comment.groupBy({ by: ["featureId"], where: { organizationId, featureType: THREAD_FEATURE_TYPE, featureId: { in: threads.map((t) => t.id) } }, _count: { _all: true } })
    : [];
  const previews = threads.length
    ? await db.comment.findMany({ where: { organizationId, featureType: THREAD_FEATURE_TYPE, featureId: { in: threads.map((t) => t.id) } }, orderBy: { createdAt: "desc" }, select: { featureId: true, body: true } })
    : [];
  const countById = new Map(counts.map((c) => [c.featureId, c._count._all]));
  const previewById = new Map<string, string>();
  for (const p of previews) if (!previewById.has(p.featureId)) previewById.set(p.featureId, p.body);

  const summaries: ThreadSummary[] = threads.map((thread) => ({
    id: thread.id,
    subject: thread.subject,
    lastMessageAt: thread.lastMessageAt,
    messageCount: countById.get(thread.id) ?? 0,
    preview: (previewById.get(thread.id) ?? "").slice(0, 120),
  }));

  if (legacy.length > 0) {
    summaries.push({ id: GENERAL_THREAD_ID, subject: "General", lastMessageAt: legacy[0].createdAt, messageCount: legacy.length, preview: legacy[0].body.slice(0, 120) });
  }
  return summaries.sort((a, b) => b.lastMessageAt.getTime() - a.lastMessageAt.getTime());
}

export async function listThreadMessages(organizationId: string, jobId: string, threadId: string) {
  if (threadId === GENERAL_THREAD_ID) {
    return db.comment.findMany({ where: { organizationId, featureType: LEGACY_JOB_FEATURE_TYPE, featureId: jobId }, orderBy: { createdAt: "asc" }, include: { authorUser: true } });
  }
  const thread = await db.messageThread.findFirst({ where: { id: threadId, jobId, organizationId }, select: { id: true } });
  if (!thread) throw new MessageThreadNotFoundError(threadId);
  return db.comment.findMany({ where: { organizationId, featureType: THREAD_FEATURE_TYPE, featureId: thread.id }, orderBy: { createdAt: "asc" }, include: { authorUser: true } });
}
