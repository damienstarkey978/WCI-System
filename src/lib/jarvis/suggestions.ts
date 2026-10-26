/**
 * Example prompts shown on an empty Jarvis conversation (handoff-ai-analysis-and-
 * jarvis-deep-integration-spec.md Part 3.5 — "an empty conversation should
 * proactively suggest what it can do rather than showing a bare empty state").
 * Shared between the docked launcher and the full /jarvis page so they stay in sync.
 */
export const JARVIS_SUGGESTIONS = [
  "Draft an estimate and proposal from these notes",
  "What's the status of this job?",
  "Draft a change order for this",
  "Log today's site visit",
  "What are my open to-dos?",
] as const;

/** Lead Proposals tab — Handy-shaped notes → lines → proposal prompts. */
export const JARVIS_LEAD_PROPOSAL_SUGGESTIONS = [
  "Draft a proposal from the lead notes and any photos I attach",
  "Rewrite the scope in plain language for the homeowner",
  "List open proposals for this lead",
] as const;

/** Job Estimates tab — same Handy split anchored to an existing job. */
export const JARVIS_JOB_ESTIMATE_SUGGESTIONS = [
  "Draft an estimate and proposal from this scope",
  "Add line items for painting and trim from my notes",
  "What estimates already exist on this job?",
] as const;
