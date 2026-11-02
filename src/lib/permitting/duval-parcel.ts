/**
 * Duval County parcel lookup via City of Jacksonville ArcGIS Parcels layer.
 * Used for Permit Rockstar–style address lock → Confirm → form prefill.
 * Never invents owner / RE# / legal — returns only what the layer provides.
 *
 * Endpoint: https://maps.coj.net/coj/rest/services/CityBiz/Parcels/MapServer/0
 */

export const DUVAL_PARCELS_LAYER_URL =
  "https://maps.coj.net/coj/rest/services/CityBiz/Parcels/MapServer/0";

const STREET_SUFFIXES = new Set([
  "RD",
  "ROAD",
  "ST",
  "STREET",
  "AVE",
  "AVENUE",
  "BLVD",
  "BOULEVARD",
  "DR",
  "DRIVE",
  "LN",
  "LANE",
  "CT",
  "COURT",
  "CIR",
  "CIRCLE",
  "WAY",
  "PL",
  "PLACE",
  "TER",
  "TERRACE",
  "HWY",
  "HIGHWAY",
  "PKWY",
  "PARKWAY",
]);

export type ParsedSiteAddress = {
  readonly streetNo: string;
  readonly streetName: string;
  readonly streetType: string | null;
  readonly city: string | null;
  readonly postalCode: string | null;
  readonly raw: string;
};

export type DuvalParcelOwner = {
  readonly name: string;
};

export type DuvalParcelResult = {
  readonly parcelId: string;
  readonly parcelIdDigits: string;
  /** Display folio e.g. 100804-0000 */
  readonly taxFolioDisplay: string;
  readonly ownerOfRecord: string;
  readonly owners: readonly DuvalParcelOwner[];
  readonly siteAddress: string;
  readonly city: string | null;
  readonly postalCode: string | null;
  readonly mailingAddressLine1: string | null;
  readonly mailingCityStateZip: string | null;
  readonly legalDescription: string;
  readonly latitude: number | null;
  readonly longitude: number | null;
  readonly geometry: {
    readonly rings?: readonly (readonly (readonly number[])[])[];
  } | null;
  readonly rawAttributes: Readonly<Record<string, unknown>>;
};

export class DuvalParcelLookupError extends Error {
  constructor(
    message: string,
    readonly code: "validation" | "upstream" | "not_found" = "validation",
  ) {
    super(message);
    this.name = "DuvalParcelLookupError";
  }
}

function trim(value: unknown): string {
  return typeof value === "string" ? value.trim() : value == null ? "" : String(value).trim();
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/** Normalize RE `100804 0000` / `1008040000` → display `100804-0000`. */
export function formatTaxFolioDisplay(re: string): string {
  const digits = re.replace(/\D/g, "");
  if (digits.length === 10) return `${digits.slice(0, 6)}-${digits.slice(6)}`;
  const spaced = re.trim().replace(/\s+/g, " ");
  if (/^\d{6}\s+\d{4}$/.test(spaced)) return spaced.replace(" ", "-");
  return spaced || re.trim();
}

/**
 * Parse a free-text site address into street number + name for ArcGIS where clauses.
 * Does not invent missing parts — returns null streetNo when unparseable.
 */
export function parseSiteAddress(input: string): ParsedSiteAddress | null {
  const raw = input.trim();
  if (!raw) return null;

  // Strip trailing ", City ST ZIP"
  let working = raw;
  let city: string | null = null;
  let postalCode: string | null = null;
  const comma = working.indexOf(",");
  if (comma >= 0) {
    const tail = working.slice(comma + 1).trim();
    working = working.slice(0, comma).trim();
    const cityStateZip = tail.match(
      /^([A-Za-z][A-Za-z .'-]*?)\s+([A-Za-z]{2})\s+(\d{5})(?:-\d{4})?\s*$/,
    );
    if (cityStateZip) {
      city = cityStateZip[1]!.trim() || null;
      postalCode = cityStateZip[3] ?? null;
    } else {
      const zipMatch = tail.match(/\b(\d{5})(?:-\d{4})?\b/);
      if (zipMatch) postalCode = zipMatch[1] ?? null;
      const cityOnly = tail.replace(/\b[A-Za-z]{2}\b/, "").replace(/\d{5}(?:-\d{4})?/, "").trim();
      if (cityOnly) city = cityOnly;
    }
  }

  const m = working.match(/^(\d+[A-Za-z]?)\s+(.+)$/);
  if (!m) return null;
  const streetNo = m[1]!.trim();
  const restTokens = m[2]!.trim().split(/\s+/).filter(Boolean);
  if (restTokens.length === 0) return null;

  let streetType: string | null = null;
  const last = restTokens[restTokens.length - 1]!.replace(/\./g, "").toUpperCase();
  if (STREET_SUFFIXES.has(last)) {
    streetType = last;
    restTokens.pop();
  }
  const streetName = restTokens.join(" ").trim();
  if (!streetName) return null;

  return { streetNo, streetName, streetType, city, postalCode, raw };
}

function joinLegal(attrs: Record<string, unknown>): string {
  return ["LEGAL1", "LEGAL2", "LEGAL3", "LEGAL4", "LEGAL5"]
    .map((k) => trim(attrs[k]))
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

function siteAddressFromAttrs(attrs: Record<string, unknown>): string {
  const parts = [
    trim(attrs.STREET_NO),
    trim(attrs.ST_DIR),
    trim(attrs.ST_NAME),
    trim(attrs.ST_TYPE),
    trim(attrs.UNIT_NO) ? `#${trim(attrs.UNIT_NO)}` : "",
  ].filter(Boolean);
  return parts.join(" ").replace(/\s+/g, " ").trim();
}

function mailingCityStateZip(attrs: Record<string, unknown>): string | null {
  const city = trim(attrs.MAILCITY);
  const state = trim(attrs.MAILSTATE);
  const zip = trim(attrs.MAILZIP);
  const line = [city, state, zip].filter(Boolean).join(", ");
  return line || null;
}

function featureToResult(feature: {
  attributes?: Record<string, unknown>;
  geometry?: { rings?: number[][][] };
}): DuvalParcelResult | null {
  const attrs = feature.attributes ?? {};
  const re = trim(attrs.RE) || trim(attrs.RE_NOSPACE);
  if (!re) return null;
  const digits = re.replace(/\D/g, "") || trim(attrs.RE_NOSPACE);
  const owner = trim(attrs.LNAMEOWNER);
  const owner2 = trim(attrs.LNAME2);
  const owners: DuvalParcelOwner[] = [];
  if (owner) owners.push({ name: owner });
  if (owner2 && owner2 !== owner) owners.push({ name: owner2 });

  const lat = asNumber(attrs.LAT) ?? asNumber(attrs.Y_WGS);
  const lng = asNumber(attrs.LONG) ?? asNumber(attrs.X_WGS);

  return {
    parcelId: re,
    parcelIdDigits: digits,
    taxFolioDisplay: formatTaxFolioDisplay(re),
    ownerOfRecord: owner,
    owners,
    siteAddress: siteAddressFromAttrs(attrs),
    city: trim(attrs.ADDRCITY) || null,
    postalCode: attrs.ZIPCODE != null ? String(attrs.ZIPCODE) : null,
    mailingAddressLine1: trim(attrs.MAILADDR1) || null,
    mailingCityStateZip: mailingCityStateZip(attrs),
    legalDescription: joinLegal(attrs),
    latitude: lat,
    longitude: lng,
    geometry: feature.geometry?.rings ? { rings: feature.geometry.rings } : null,
    rawAttributes: attrs,
  };
}

export type LookupDuvalParcelsInput = {
  readonly address?: string;
  readonly streetNo?: string;
  readonly streetName?: string;
  readonly re?: string;
  readonly resultRecordCount?: number;
};

type FetchLike = (
  input: string | URL,
  init?: { method?: string; headers?: Record<string, string>; signal?: AbortSignal },
) => Promise<{ ok: boolean; status: number; json(): Promise<unknown>; text(): Promise<string> }>;

/**
 * Query Duval parcels. Prefer `re` (exact), else streetNo+streetName, else parse `address`.
 */
export async function lookupDuvalParcels(
  input: LookupDuvalParcelsInput,
  options?: { fetch?: FetchLike; signal?: AbortSignal },
): Promise<DuvalParcelResult[]> {
  const fetchFn = options?.fetch ?? (globalThis.fetch as FetchLike);
  const limit = Math.min(Math.max(input.resultRecordCount ?? 10, 1), 25);

  let where: string | null = null;
  const re = trim(input.re);
  if (re) {
    const digits = re.replace(/\D/g, "");
    where = digits
      ? `RE_NOSPACE='${digits.replace(/'/g, "''")}'`
      : `RE='${re.replace(/'/g, "''")}'`;
  } else {
    let streetNo = trim(input.streetNo);
    let streetName = trim(input.streetName);
    if ((!streetNo || !streetName) && input.address) {
      const parsed = parseSiteAddress(input.address);
      if (!parsed) {
        throw new DuvalParcelLookupError(
          "Enter a street number and name (e.g. 4212 Robin Hood Rd).",
          "validation",
        );
      }
      streetNo = parsed.streetNo;
      streetName = parsed.streetName;
    }
    if (!streetNo || !streetName) {
      throw new DuvalParcelLookupError(
        "Street number and street name are required for parcel lookup.",
        "validation",
      );
    }
    const no = streetNo.replace(/'/g, "''");
    const name = streetName.replace(/'/g, "''").toUpperCase();
    where = `STREET_NO='${no}' AND UPPER(ST_NAME) LIKE UPPER('%${name}%')`;
  }

  const params = new URLSearchParams({
    where,
    outFields: [
      "RE",
      "RE_NOSPACE",
      "LNAMEOWNER",
      "LNAME2",
      "STREET_NO",
      "ST_DIR",
      "ST_NAME",
      "ST_TYPE",
      "UNIT_NO",
      "ADDRCITY",
      "ZIPCODE",
      "MAILADDR1",
      "MAILADDR2",
      "MAILADDR3",
      "MAILCITY",
      "MAILSTATE",
      "MAILZIP",
      "LEGAL1",
      "LEGAL2",
      "LEGAL3",
      "LEGAL4",
      "LEGAL5",
      "DESCPU",
      "PUSE",
      "LAT",
      "LONG",
      "X_WGS",
      "Y_WGS",
    ].join(","),
    returnGeometry: "true",
    outSR: "4326",
    f: "json",
    resultRecordCount: String(limit),
  });

  const url = `${DUVAL_PARCELS_LAYER_URL}/query?${params.toString()}`;
  let response: Awaited<ReturnType<FetchLike>>;
  try {
    response = await fetchFn(url, {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: options?.signal,
    });
  } catch {
    throw new DuvalParcelLookupError("Duval parcel service unreachable.", "upstream");
  }

  if (!response.ok) {
    throw new DuvalParcelLookupError(
      `Duval parcel service returned HTTP ${response.status}.`,
      "upstream",
    );
  }

  const body = (await response.json()) as {
    error?: { message?: string };
    features?: { attributes?: Record<string, unknown>; geometry?: { rings?: number[][][] } }[];
  };

  if (body.error) {
    throw new DuvalParcelLookupError(
      body.error.message || "Duval parcel query failed.",
      "upstream",
    );
  }

  const results = (body.features ?? [])
    .map((f) => featureToResult(f))
    .filter((r): r is DuvalParcelResult => r != null);

  return results;
}

export type JobParcelSnapshot = {
  readonly parcelId: string;
  readonly taxFolioDisplay: string;
  readonly ownerOfRecord: string;
  readonly owners: readonly DuvalParcelOwner[];
  readonly siteAddress: string;
  readonly city: string | null;
  readonly postalCode: string | null;
  readonly mailingAddressLine1: string | null;
  readonly mailingCityStateZip: string | null;
  readonly legalDescription: string;
  readonly latitude: number | null;
  readonly longitude: number | null;
  readonly geometry: DuvalParcelResult["geometry"];
  readonly confirmedAt: string;
  readonly source: "maps.coj.net/CityBiz/Parcels";
};

export function toJobParcelSnapshot(parcel: DuvalParcelResult, confirmedAt = new Date()): JobParcelSnapshot {
  return {
    parcelId: parcel.parcelId,
    taxFolioDisplay: parcel.taxFolioDisplay,
    ownerOfRecord: parcel.ownerOfRecord,
    owners: parcel.owners,
    siteAddress: parcel.siteAddress,
    city: parcel.city,
    postalCode: parcel.postalCode,
    mailingAddressLine1: parcel.mailingAddressLine1,
    mailingCityStateZip: parcel.mailingCityStateZip,
    legalDescription: parcel.legalDescription,
    latitude: parcel.latitude,
    longitude: parcel.longitude,
    geometry: parcel.geometry,
    confirmedAt: confirmedAt.toISOString(),
    source: "maps.coj.net/CityBiz/Parcels",
  };
}

/** Package fieldValues bag keys filled from a confirmed parcel (staff may still edit). */
export function packageFieldsFromParcel(parcel: DuvalParcelResult): Record<string, string> {
  const fields: Record<string, string> = {};
  if (parcel.ownerOfRecord) fields.ownerName = parcel.ownerOfRecord;
  if (parcel.mailingAddressLine1) fields.ownerMailingAddress = parcel.mailingAddressLine1;
  if (parcel.mailingCityStateZip) fields.ownerCityStateZip = parcel.mailingCityStateZip;
  if (parcel.legalDescription) fields.legalDescription = parcel.legalDescription;
  if (parcel.taxFolioDisplay) fields.taxFolio = parcel.taxFolioDisplay;
  return fields;
}
