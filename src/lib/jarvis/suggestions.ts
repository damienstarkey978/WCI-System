/**
 * Example prompts shown on an empty Jarvis conversation (handoff-ai-analysis-and-
 * jarvis-deep-integration-spec.md Part 3.5 — "an empty conversation should
 * proactively suggest what it can do rather than showing a bare empty state").
 * Shared between the docked launcher and the full /jarvis page so they stay in sync.
 */
export const JARVIS_SUGGESTIONS = [
  "What's the status of this job?",
  "Draft a change order for this",
  "Log today's site visit",
  "What are my open to-dos?",
] as const;
