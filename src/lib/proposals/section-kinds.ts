/**
 * Proposal section kinds (Handoff parity CR P2 #20).
 * SCOPE (default) plus EXCLUSIONS and WARRANTY with WCI defaults.
 */

export type ProposalSectionKindValue = "SCOPE" | "EXCLUSIONS" | "WARRANTY";

export const DEFAULT_EXCLUSIONS_BULLETS = [
  "Floor leveling is not included unless specifically scoped in this proposal.",
  "Structural repairs, moisture remediation, and elevation work are excluded unless listed above.",
  "All quantities and existing conditions are subject to field verification.",
] as const;

export const DEFAULT_WARRANTY_BULLETS = [
  "World Construction Inc. warrants all workmanship performed under this agreement for a period of one (1) year from the date of substantial completion.",
  "A twenty (20) year structural warranty covers structural integrity of the work performed, subject to the exclusions in the Terms & Conditions.",
  "Manufacturer warranties on materials and equipment are passed through to the Owner.",
] as const;

export function defaultSectionsForProposal(options?: {
  readonly includeRoofWarranty?: boolean;
  readonly includeWoodReplacement?: boolean;
}): readonly {
  readonly kind: ProposalSectionKindValue;
  readonly title: string;
  readonly bullets: readonly string[];
}[] {
  const warrantyBullets = options?.includeRoofWarranty
    ? [
        "World Construction Inc. warrants roofing workmanship for five (5) years from substantial completion.",
        ...DEFAULT_WARRANTY_BULLETS.slice(1),
      ]
    : [...DEFAULT_WARRANTY_BULLETS];

  const exclusionBullets = options?.includeWoodReplacement
    ? [
        ...DEFAULT_EXCLUSIONS_BULLETS,
        "Damaged wood discovered during tear-off (decking, fascia, or framing) will be replaced as needed and billed as a change order at the prevailing unit rates unless already scoped.",
      ]
    : [...DEFAULT_EXCLUSIONS_BULLETS];

  return [
    {
      kind: "EXCLUSIONS",
      title: "Exclusions",
      bullets: exclusionBullets,
    },
    {
      kind: "WARRANTY",
      title: "Warranty",
      bullets: warrantyBullets,
    },
  ];
}

/** Merge caller-supplied sections with missing EXCLUSIONS/WARRANTY defaults. */
export function mergeProposalSectionsWithDefaults(
  supplied: readonly {
    readonly title: string;
    readonly bullets: readonly string[];
    readonly kind?: ProposalSectionKindValue | null;
  }[],
  options?: { readonly includeRoofWarranty?: boolean; readonly includeWoodReplacement?: boolean },
): readonly {
  readonly kind: ProposalSectionKindValue;
  readonly title: string;
  readonly bullets: readonly string[];
}[] {
  const normalized = supplied.map((section) => ({
    kind: (section.kind ?? "SCOPE") as ProposalSectionKindValue,
    title: section.title,
    bullets: [...section.bullets],
  }));
  const kinds = new Set(normalized.map((section) => section.kind));
  const defaults = defaultSectionsForProposal(options);
  const missing = defaults.filter((section) => !kinds.has(section.kind));
  return [...normalized, ...missing];
}
