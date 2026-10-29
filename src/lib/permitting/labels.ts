/**
 * Client-safe trade labels (no db / email imports).
 */

import { PermitTrade } from "@/generated/prisma/enums";

export function tradeLabel(trade: PermitTrade): string {
  switch (trade) {
    case PermitTrade.BUILDING:
      return "Building";
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
