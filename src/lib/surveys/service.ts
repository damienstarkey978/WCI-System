/**
 * Surveys (CLAUDE.md 2.3/3, Phase 6): touchpoint feedback
 * (PRE_PROJECT/MID_PROJECT/POST_COMPLETION). A SurveyResponseLink is the same
 * "no account, one signed link" shape as SubmittalReviewLink — most survey
 * recipients aren't portal Clients, or the survey would just be a portal
 * page. `answers` is a questionId -> answer text map: write-once feedback
 * with no need to be queried per-question, unlike a Submittal's structured
 * decision.
 */

import { db } from "@/lib/db";
import { generateSecureToken, parseSecureToken, secretMatches } from "@/lib/secure-tokens";
import { emitEvent } from "@/lib/webhooks";

const RESPONSE_LINK_PREFIX = "wcisvl";
const RESPONSE_LINK_TTL_MS = 60 * 24 * 60 * 60 * 1000; // 60 days

export class JobNotFoundError extends Error {
  constructor(jobId: string) {
    super(`Job ${jobId} not found`);
    this.name = "JobNotFoundError";
  }
}

export class SurveyNotFoundError extends Error {
  constructor(surveyId: string) {
    super(`Survey ${surveyId} not found`);
    this.name = "SurveyNotFoundError";
  }
}

export interface CreateSurveyQuestionInput {
  readonly prompt: string;
}

export interface CreateSurveyInput {
  readonly organizationId: string;
  readonly jobId: string;
  readonly title: string;
  readonly touchpoint: "PRE_PROJECT" | "MID_PROJECT" | "POST_COMPLETION";
  readonly questions: readonly CreateSurveyQuestionInput[];
}

export async function createSurvey(input: CreateSurveyInput) {
  const job = await db.job.findFirst({ where: { id: input.jobId, organizationId: input.organizationId }, select: { id: true } });
  if (!job) throw new JobNotFoundError(input.jobId);

  return db.survey.create({
    data: {
      organizationId: input.organizationId,
      jobId: input.jobId,
      title: input.title,
      touchpoint: input.touchpoint,
      questions: { create: input.questions.map((q, index) => ({ prompt: q.prompt, sortOrder: index })) },
    },
    include: { questions: { orderBy: { sortOrder: "asc" } } },
  });
}

export interface IssueResponseLinkInput {
  readonly organizationId: string;
  readonly surveyId: string;
  readonly recipientName?: string | null;
  readonly recipientEmail?: string | null;
}

export async function issueResponseLink(input: IssueResponseLinkInput) {
  const survey = await db.survey.findFirst({ where: { id: input.surveyId, organizationId: input.organizationId } });
  if (!survey) throw new SurveyNotFoundError(input.surveyId);

  const generated = generateSecureToken(RESPONSE_LINK_PREFIX);
  await db.surveyResponseLink.create({
    data: {
      surveyId: input.surveyId,
      recipientName: input.recipientName ?? null,
      recipientEmail: input.recipientEmail ?? null,
      tokenId: generated.tokenId,
      hashedSecret: generated.hashedSecret,
      expiresAt: new Date(Date.now() + RESPONSE_LINK_TTL_MS),
    },
  });

  await emitEvent(input.organizationId, "survey.response_requested", {
    surveyId: input.surveyId,
    recipientEmail: input.recipientEmail ?? null,
  });

  return { token: generated.token };
}

export class InvalidResponseLinkError extends Error {
  constructor() {
    super("This survey link is invalid, expired, or has already been used.");
    this.name = "InvalidResponseLinkError";
  }
}

/** Redeem a response link with the recipient's answers (questionId -> text), single-use. */
export async function submitResponse(token: string, answers: Record<string, string>) {
  const parsed = parseSecureToken(RESPONSE_LINK_PREFIX, token);
  if (!parsed) throw new InvalidResponseLinkError();

  const link = await db.surveyResponseLink.findUnique({ where: { tokenId: parsed.tokenId } });
  if (
    !link ||
    !secretMatches(parsed.secret, link.hashedSecret) ||
    link.submittedAt !== null ||
    link.expiresAt.getTime() <= Date.now()
  ) {
    throw new InvalidResponseLinkError();
  }

  const updated = await db.surveyResponseLink.update({
    where: { id: link.id },
    data: { answers, submittedAt: new Date() },
  });

  const survey = await db.survey.findUniqueOrThrow({ where: { id: link.surveyId }, select: { organizationId: true, jobId: true } });
  await emitEvent(survey.organizationId, "survey.response_submitted", { surveyId: link.surveyId, jobId: survey.jobId });

  return updated;
}
