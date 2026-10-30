/**
 * Permit Rockstar inspection photo guides (content URLs only).
 * Folder / inspection names for demo come from city-style placeholders listed
 * here; production names come from city permitting software. No pools.
 */

export interface InspectionGuide {
  readonly trade: "BUILDING" | "ELECTRICAL" | "PLUMBING" | "MECHANICAL" | "ROOFING";
  readonly title: string;
  readonly slug: string;
  readonly guideUrl: string;
  /** Universal evidence tips from the catalog (not invented per-guide steps). */
  readonly tips: readonly string[];
}

const UNIVERSAL_TIPS = [
  "Wide views first, then close-ups",
  "Use a measuring tape for dimensions",
  "Use a level for slope when relevant",
  "Keep the work exposed",
  "Only photograph evidence for the permitted scope",
] as const;

function guide(
  trade: InspectionGuide["trade"],
  title: string,
  slug: string,
  path: string,
): InspectionGuide {
  return {
    trade,
    title,
    slug,
    guideUrl: `https://permitrockstar.com/inspection-guides/${path}`,
    tips: UNIVERSAL_TIPS,
  };
}

/** Demo/placeholder inspection catalog mapped to Permit Rockstar guides (no pools). */
export const INSPECTION_GUIDES: readonly InspectionGuide[] = [
  guide("BUILDING", "Footer", "footer", "building/footers/"),
  guide("BUILDING", "Slab", "slab", "building/slab/"),
  guide("BUILDING", "Framing", "framing", "building/framing/"),
  guide("BUILDING", "Wall Sheathing", "wall-sheathing", "building/wall-sheathing/"),
  guide("BUILDING", "Roof Sheathing", "roof-sheathing", "building/roof-sheathing/"),
  guide("BUILDING", "Roof / Wall Sheathing", "roof-wall-sheathing", "building/roof-wall-sheathing/"),
  guide("BUILDING", "Dry-In", "dry-in", "building/dry-in/"),
  guide("BUILDING", "Insulation", "insulation", "building/insulation/"),
  guide("BUILDING", "Fill Cell", "fill-cell", "building/fill-cell/"),
  guide("BUILDING", "Lintel", "lintel", "building/lintel/"),
  guide("BUILDING", "Drywall Fastening", "drywall-fastening", "building/drywall-fastening/"),
  guide("BUILDING", "Windows & Doors", "windows-and-doors", "building/windows-and-doors/"),
  guide("BUILDING", "Building Final", "building-final", "building/building-final/"),
  guide("ELECTRICAL", "Electrical Rough", "electrical-rough", "electrical/electrical-rough/"),
  guide("ELECTRICAL", "Electrical Cover-Up", "electrical-cover-up", "electrical/electrical-rough/"),
  guide("ELECTRICAL", "Electrical Underground", "electrical-underground", "electrical/electrical-underground/"),
  guide("ELECTRICAL", "Electrical Final", "electrical-final", "electrical/electrical-final/"),
  guide("PLUMBING", "Plumbing Rough", "plumbing-rough", "plumbing/plumbing-rough/"),
  guide("PLUMBING", "Plumbing Underground", "plumbing-underground", "plumbing/plumbing-underground/"),
  guide("PLUMBING", "Plumbing Final", "plumbing-final", "plumbing/plumbing-final/"),
  guide("MECHANICAL", "Mechanical Rough", "mechanical-rough", "building/mechanical-rough/"),
  guide("MECHANICAL", "Mechanical Final", "mechanical-final", "mechanical/mechanical-final/"),
  guide("ROOFING", "Roof Sheathing", "roof-sheathing-roofing", "building/roof-sheathing/"),
  guide("ROOFING", "Roof Final", "roof-final", "building/dry-in/"),
];

const BY_TITLE = new Map(INSPECTION_GUIDES.map((g) => [g.title.toLowerCase(), g]));

export function guideForInspectionName(name: string): InspectionGuide | null {
  return BY_TITLE.get(name.trim().toLowerCase()) ?? null;
}

/** Preferred folder label when the city inspection name is unique on the job. */
export function inspectionPictureFolderName(inspectionName: string): string {
  return `Inspection: ${inspectionName.trim()}`;
}

/**
 * Disambiguated folder label when two permits on the same job share an inspection
 * name (e.g. BUILDING Final + ELECTRICAL Final). folderId is @unique on
 * JobPermitInspection, so each inspection needs its own FileFolder.
 */
export function inspectionPictureFolderNameForTrade(
  inspectionName: string,
  trade: string,
): string {
  return `Inspection: ${trade} — ${inspectionName.trim()}`;
}

export function isSlabInspection(name: string): boolean {
  return name.trim().toLowerCase() === "slab";
}
