/**
 * Request validation schemas for /api/v1. Shared between route handlers and tests so
 * the OpenAPI spec published in Phase 1 has one source of truth.
 */

import { z } from "zod";

import { ContractType, CostType, JobStatus } from "@/generated/prisma/enums";

const nullableTrimmed = z.string().trim().min(1).max(255).nullish();

export const createJobSchema = z.object({
  name: z.string().trim().min(1).max(255),
  contractType: z.enum(ContractType),
  prefix: z.string().trim().min(1).max(32).nullish(),
  jobGroupId: z.string().cuid().nullish(),
  addressLine1: nullableTrimmed,
  addressLine2: nullableTrimmed,
  city: nullableTrimmed,
  state: z.string().trim().length(2).nullish(),
  postalCode: z.string().trim().min(3).max(16).nullish(),
  latitude: z.number().min(-90).max(90).nullish(),
  longitude: z.number().min(-180).max(180).nullish(),
  sqft: z.number().int().positive().nullish(),
  permitNumber: nullableTrimmed,
  lotInfo: nullableTrimmed,
  projectedStart: z.coerce.date().nullish(),
  projectedEnd: z.coerce.date().nullish(),
  scheduleColor: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, "scheduleColor must be a hex color such as #1f6feb")
    .nullish(),
  customFields: z.record(z.string(), z.unknown()).optional(),
  isTemplate: z.boolean().optional(),
});

export type CreateJobInput = z.infer<typeof createJobSchema>;

export const listJobsQuerySchema = z.object({
  status: z.enum(JobStatus).optional(),
  contractType: z.enum(ContractType).optional(),
  jobGroupId: z.string().cuid().optional(),
  includeTemplates: z.coerce.boolean().optional().default(false),
  limit: z.coerce.number().int().min(1).max(200).optional().default(50),
  cursor: z.string().cuid().optional(),
});

export const transitionJobStatusSchema = z.object({
  status: z.enum(JobStatus),
  reason: z.string().trim().max(500).optional(),
});

export const createCostCodeSchema = z.object({
  code: z.string().trim().min(1).max(32),
  name: z.string().trim().min(1).max(255),
  defaultCostType: z.enum(CostType).optional().default(CostType.NONE),
  parentId: z.string().cuid().nullish(),
  sortOrder: z.number().int().min(0).optional(),
  isActive: z.boolean().optional(),
});

export const listCostCodesQuerySchema = z.object({
  includeInactive: z.coerce.boolean().optional().default(false),
  costType: z.enum(CostType).optional(),
});

/** Turn a Zod failure into the API's standard error detail shape. */
export function formatZodIssues(error: z.ZodError): ReadonlyArray<{ path: string; message: string }> {
  return error.issues.map((issue) => ({
    path: issue.path.join(".") || "(root)",
    message: issue.message,
  }));
}
