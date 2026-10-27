/**
 * Native proposal e-sign helpers (CLAUDE.md: signed hash + timestamp + IP).
 * Used for both client acceptance and WCI company counter-sign.
 */

import { createHash } from "node:crypto";

export type ProposalSignPayload = {
  readonly proposalId: string;
  readonly role: "client" | "company";
  readonly signatureName: string;
  readonly signedAtIso: string;
  readonly signatureIp: string | null;
  readonly termsText: string | null;
  readonly selectedOptionId: string | null;
};

export function hashProposalSignature(payload: ProposalSignPayload): string {
  const material = [
    payload.proposalId,
    payload.role,
    payload.signatureName.trim(),
    payload.signedAtIso,
    payload.signatureIp ?? "",
    payload.selectedOptionId ?? "",
    payload.termsText ?? "",
  ].join("\n");
  return createHash("sha256").update(material, "utf8").digest("hex");
}
