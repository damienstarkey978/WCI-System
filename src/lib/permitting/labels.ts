/**
 * Client-safe trade / status labels (no db / email imports).
 */

import { InspectionResult, PermitStatus, PermitTrade } from "@/generated/prisma/enums";

export function tradeLabel(trade: PermitTrade): string {
  switch (trade) {
    case PermitTrade.BUILDING:
      return "Building";
    case PermitTrade.TEMP_POLE:
      return "Temp pole";
    case PermitTrade.SITE:
      return "Site";
    case PermitTrade.ELECTRICAL:
      return "Electrical";
    case PermitTrade.PLUMBING:
      return "Plumbing";
    case PermitTrade.MECHANICAL:
      return "Mechanical";
    case PermitTrade.ROOFING:
      return "Roofing";
    case PermitTrade.OTHER:
      return "Other";
  }
}

export function permitStatusLabel(status: PermitStatus): string {
  switch (status) {
    case PermitStatus.DRAFT:
      return "Draft";
    case PermitStatus.PENDING_PAYMENT:
      return "Pending Payment";
    case PermitStatus.ACTIVE:
      return "Active";
    case PermitStatus.FINALIZED:
      return "Finalized";
    case PermitStatus.RETURNED_FOR_CORRECTIONS:
      return "Returned for corrections";
    case PermitStatus.EXPIRED:
      return "Expired";
    case PermitStatus.CANCELLED:
      return "Cancelled";
  }
}

export function inspectionResultLabel(result: InspectionResult): string {
  switch (result) {
    case InspectionResult.PENDING:
      return "Pending";
    case InspectionResult.PASS:
      return "Pass";
    case InspectionResult.FAIL:
      return "Fail";
    case InspectionResult.PARTIAL:
      return "Partial";
  }
}

/** Display title for a permit card — label overrides trade when set. */
export function permitDisplayTitle(permit: {
  readonly trade: PermitTrade;
  readonly label?: string | null;
}): string {
  const custom = permit.label?.trim();
  if (custom) return custom;
  return `${tradeLabel(permit.trade)} permit`;
}
