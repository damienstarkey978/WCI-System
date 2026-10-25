/**
 * Short trade label for places that show a vendor in a list or dropdown: the free-text
 * `tradeType` if someone set one, otherwise the first few Buildertrend divisions
 * ("Concrete, Masonry +3") — a sub imported with 20 divisions must not blow up a <select>.
 */
export function vendorTradeLabel(vendor: { tradeType: string | null; divisions: readonly string[] }, maxDivisions = 2): string | null {
  if (vendor.tradeType) return vendor.tradeType;
  if (vendor.divisions.length === 0) return null;
  const shown = vendor.divisions.slice(0, maxDivisions).join(", ");
  const extra = vendor.divisions.length - maxDivisions;
  return extra > 0 ? `${shown} +${extra}` : shown;
}
