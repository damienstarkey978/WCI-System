/**
 * Prepared-for contact (Handoff parity CR P2 #21 + #22).
 * Name, email, and phone must be present before send; email TLD typos flagged.
 */

import { findLeadEmailIssues } from "@/lib/crm/email";

export class IncompletePreparedForError extends Error {
  constructor(public readonly reasons: readonly string[]) {
    super(`Prepared-for contact is incomplete: ${reasons.join("; ")}`);
    this.name = "IncompletePreparedForError";
  }
}

export function findPreparedForIssues(contact: {
  readonly name?: string | null;
  readonly email?: string | null;
  readonly phone?: string | null;
}): string[] {
  const issues: string[] = [];
  if (!contact.name?.trim()) issues.push("Prepared-for name is required.");
  if (!contact.phone?.trim()) issues.push("Prepared-for phone is required.");
  for (const message of findLeadEmailIssues(contact.email)) {
    issues.push(message.startsWith("Email") ? `Prepared-for ${message.charAt(0).toLowerCase()}${message.slice(1)}` : message);
  }
  return issues;
}

export function assertPreparedForReady(contact: {
  readonly name?: string | null;
  readonly email?: string | null;
  readonly phone?: string | null;
}): void {
  const issues = findPreparedForIssues(contact);
  if (issues.length > 0) throw new IncompletePreparedForError(issues);
}
