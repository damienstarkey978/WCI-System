/**
 * Database wiring for the AI weekly client-update summary. Keeps src/lib/ai/weekly-
 * summary-assistant.ts free of Prisma so its Claude-calling logic stays
 * unit-testable with a fake client — same split as every other AI module here.
 *
 * This is the one place that decides what "client-visible activity" means, and it
 * is the load-bearing safety boundary for the whole feature: only DailyLogs and
 * ScheduleItems already flagged clientVisible are read, and nothing budget/cost-
 * shaped is queried at all — not filtered out after the fact, never fetched in the
 * first place. See CLAUDE.md's Phase 8 deviations entry.
 */

import { db } from "@/lib/db";
import { generateWeeklySummary } from "@/lib/ai/weekly-summary-assistant";
import { EmailNotConfiguredError, sendEmail } from "@/lib/email/send";
import { isTransactionalEmailConfigured } from "@/lib/env";
import { isSchedulePublished } from "@/lib/scheduling/publish";
import { getComputedSchedule } from "@/lib/scheduling/service";

export class JobNotFoundError extends Error {
  constructor(jobId: string) {
    super(`Job ${jobId} not found`);
    this.name = "JobNotFoundError";
  }
}

export class SummaryNotFoundError extends Error {
  constructor(summaryId: string) {
    super(`Client update ${summaryId} not found`);
    this.name = "SummaryNotFoundError";
  }
}

export class NoPrimaryClientEmailError extends Error {
  constructor(jobId: string) {
    super(`Job ${jobId} has no primary client email to send this update to.`);
    this.name = "NoPrimaryClientEmailError";
  }
}

const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export interface CreateWeeklySummaryInput {
  readonly organizationId: string;
  readonly jobId: string;
  /** Defaults to seven days ago. */
  readonly periodStart?: Date;
  /** Defaults to now. */
  readonly periodEnd?: Date;
}

async function buildClientSafeActivityText(organizationId: string, jobId: string, periodStart: Date, periodEnd: Date): Promise<string> {
  const dailyLogs = await db.dailyLog.findMany({
    where: { organizationId, jobId, clientVisible: true, createdAt: { gte: periodStart, lte: periodEnd } },
    orderBy: { createdAt: "asc" },
    select: { createdAt: true, title: true, note: true },
  });

  const schedule = await db.schedule.findFirst({ where: { organizationId, jobId }, select: { id: true, isOnline: true, isDraft: true } });
  const scheduleLines: string[] = [];
  // An offline or draft schedule is not shared with clients, so it must not leak into their digest either.
  if (schedule && isSchedulePublished(schedule)) {
    const computed = await getComputedSchedule(organizationId, schedule.id);
    for (const item of computed.items) {
      if (!item.clientVisible) continue;
      const overlapsPeriod = item.startDate <= periodEnd && item.endDate >= periodStart;
      if (!overlapsPeriod) continue;
      scheduleLines.push(
        `- Schedule: "${item.title}" (${item.startDate.toISOString().slice(0, 10)} to ${item.endDate.toISOString().slice(0, 10)}, ${item.confirmationStatus.toLowerCase()})`,
      );
    }
  }

  const dailyLogLines = dailyLogs.map((log) => {
    const title = log.title?.trim();
    const prefix = title ? `${title}: ` : "";
    return `- Site log ${log.createdAt.toISOString().slice(0, 10)}: ${prefix}${log.note}`;
  });

  return [...dailyLogLines, ...scheduleLines].join("\n");
}

/** Earliest ClientJobAccess grant on the job is the primary client (same rule as job settings). */
export async function resolvePrimaryClientEmail(organizationId: string, jobId: string): Promise<{ clientId: string; name: string; email: string } | null> {
  const access = await db.clientJobAccess.findFirst({
    where: { jobId, client: { organizationId } },
    orderBy: { createdAt: "asc" },
    include: { client: { select: { id: true, name: true, email: true } } },
  });
  if (!access?.client.email?.trim()) return null;
  return { clientId: access.client.id, name: access.client.name, email: access.client.email.trim() };
}

export interface UpdateWeeklySummaryInput {
  readonly organizationId: string;
  readonly summaryId: string;
  readonly headline: string;
  readonly body: string;
  readonly highlights: readonly string[];
}

export async function updateWeeklySummary(input: UpdateWeeklySummaryInput) {
  const existing = await db.clientUpdateSummary.findFirst({
    where: { id: input.summaryId, organizationId: input.organizationId },
  });
  if (!existing) throw new SummaryNotFoundError(input.summaryId);
  if (existing.emailedAt) {
    throw new Error("This update was already emailed. Generate a new one to send another.");
  }

  const headline = input.headline.trim();
  const body = input.body.trim();
  if (!headline) throw new Error("Headline is required.");
  if (!body) throw new Error("Body is required.");

  return db.clientUpdateSummary.update({
    where: { id: existing.id },
    data: {
      headline,
      body,
      highlights: input.highlights.map((h) => h.trim()).filter(Boolean),
    },
  });
}

export function buildClientUpdateEmail(input: {
  clientName: string;
  jobName: string;
  companyName: string;
  headline: string;
  body: string;
  highlights: readonly string[];
  periodStart: Date;
  periodEnd: Date;
}) {
  const firstName = input.clientName.trim().split(/\s+/)[0] || "there";
  const period = `${input.periodStart.toISOString().slice(0, 10)} to ${input.periodEnd.toISOString().slice(0, 10)}`;
  const highlightBlock = input.highlights.length
    ? ["", "Highlights:", ...input.highlights.map((h) => `• ${h}`)].join("\n")
    : "";
  const text = [
    `Hi ${firstName},`,
    "",
    `Here is your progress update for ${input.jobName} (${period}).`,
    "",
    input.headline,
    "",
    input.body,
    highlightBlock,
    "",
    `- ${input.companyName}`,
  ]
    .filter((line, index, arr) => !(line === "" && arr[index - 1] === ""))
    .join("\n");

  const escape = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const highlightsHtml = input.highlights.length
    ? `<ul>${input.highlights.map((h) => `<li>${escape(h)}</li>`).join("")}</ul>`
    : "";
  const html =
    `<p>Hi ${escape(firstName)},</p>` +
    `<p>Here is your progress update for <strong>${escape(input.jobName)}</strong> (${escape(period)}).</p>` +
    `<p><strong>${escape(input.headline)}</strong></p>` +
    `<p>${escape(input.body).replace(/\n/g, "<br/>")}</p>` +
    highlightsHtml +
    `<p>- ${escape(input.companyName)}</p>`;

  return {
    subject: `${input.companyName}: ${input.jobName} progress update`,
    text,
    html,
  };
}

export interface ApproveAndEmailWeeklySummaryInput {
  readonly organizationId: string;
  readonly summaryId: string;
  /** Optional final edits applied in the same step as approve+email. */
  readonly headline?: string;
  readonly body?: string;
  readonly highlights?: readonly string[];
}

export async function approveAndEmailWeeklySummary(input: ApproveAndEmailWeeklySummaryInput) {
  if (!isTransactionalEmailConfigured()) throw new EmailNotConfiguredError();

  const summary = await db.clientUpdateSummary.findFirst({
    where: { id: input.summaryId, organizationId: input.organizationId },
    include: { job: { select: { id: true, name: true } }, organization: { select: { name: true, contactEmail: true } } },
  });
  if (!summary) throw new SummaryNotFoundError(input.summaryId);
  if (summary.emailedAt) {
    throw new Error("This update was already emailed. Generate a new one to send another.");
  }

  const headline = (input.headline ?? summary.headline).trim();
  const body = (input.body ?? summary.body).trim();
  const highlights = (input.highlights ?? summary.highlights).map((h) => h.trim()).filter(Boolean);
  if (!headline || !body) throw new Error("Headline and body are required before emailing.");

  const primary = await resolvePrimaryClientEmail(input.organizationId, summary.jobId);
  if (!primary) throw new NoPrimaryClientEmailError(summary.jobId);

  const message = buildClientUpdateEmail({
    clientName: primary.name,
    jobName: summary.job.name,
    companyName: summary.organization.name,
    headline,
    body,
    highlights,
    periodStart: summary.periodStart,
    periodEnd: summary.periodEnd,
  });

  await sendEmail({
    to: primary.email,
    ...message,
    replyTo: summary.organization.contactEmail ?? undefined,
  });

  const now = new Date();
  return db.clientUpdateSummary.update({
    where: { id: summary.id },
    data: {
      headline,
      body,
      highlights,
      approvedAt: now,
      emailedAt: now,
      emailedTo: primary.email,
    },
  });
}

export interface CreateWeeklySummaryResult {
  readonly id: string;
  readonly jobId: string;
  readonly periodStart: Date;
  readonly periodEnd: Date;
  readonly headline: string;
  readonly body: string;
  readonly highlights: readonly string[];
  readonly createdAt: Date;
}

export async function createWeeklySummary(input: CreateWeeklySummaryInput): Promise<CreateWeeklySummaryResult> {
  const job = await db.job.findFirst({
    where: { id: input.jobId, organizationId: input.organizationId },
    select: { id: true, name: true },
  });
  if (!job) {
    throw new JobNotFoundError(input.jobId);
  }

  const periodEnd = input.periodEnd ?? new Date();
  const periodStart = input.periodStart ?? new Date(periodEnd.getTime() - ONE_WEEK_MS);

  const activityText = await buildClientSafeActivityText(input.organizationId, job.id, periodStart, periodEnd);

  const draft = await generateWeeklySummary({ jobName: job.name, periodStart, periodEnd, activityText });

  return db.clientUpdateSummary.create({
    data: {
      organizationId: input.organizationId,
      jobId: job.id,
      periodStart,
      periodEnd,
      headline: draft.headline,
      body: draft.body,
      highlights: draft.highlights,
    },
  });
}

export interface ListWeeklySummariesInput {
  readonly organizationId: string;
  readonly jobId?: string;
}

export async function listWeeklySummaries(input: ListWeeklySummariesInput) {
  return db.clientUpdateSummary.findMany({
    where: { organizationId: input.organizationId, ...(input.jobId ? { jobId: input.jobId } : {}) },
    orderBy: { periodEnd: "desc" },
    take: 100,
  });
}
