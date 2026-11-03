/**
 * Require-signature policy (Handoff parity CR P1 #8).
 * Default ON; only ADMIN may turn it off; send is blocked while off.
 */

export class SignatureRequiredError extends Error {
  constructor() {
    super("This proposal requires a signature. Turn require-signature back on (or have an admin disable it) before sending.");
    this.name = "SignatureRequiredError";
  }
}

export class SignaturePolicyAdminRequiredError extends Error {
  constructor() {
    super("Only an admin can turn off require-signature on a proposal.");
    this.name = "SignaturePolicyAdminRequiredError";
  }
}

export function assertCanSendWithSignaturePolicy(requireSignature: boolean): void {
  if (!requireSignature) throw new SignatureRequiredError();
}

export function assertCanDisableRequireSignature(actorRole: string | null | undefined): void {
  if (actorRole !== "ADMIN") throw new SignaturePolicyAdminRequiredError();
}
