import { describe, expect, it, vi } from "vitest";

import {
  formatTaxFolioDisplay,
  lookupDuvalParcels,
  packageFieldsFromParcel,
  parseSiteAddress,
  toJobParcelSnapshot,
  DuvalParcelLookupError,
  type DuvalParcelResult,
} from "@/lib/permitting/duval-parcel";

describe("parseSiteAddress", () => {
  it("parses number, name, suffix, city, zip", () => {
    expect(parseSiteAddress("4212 Robin Hood Rd, Jacksonville FL 32210")).toEqual({
      streetNo: "4212",
      streetName: "Robin Hood",
      streetType: "RD",
      city: "Jacksonville",
      postalCode: "32210",
      raw: "4212 Robin Hood Rd, Jacksonville FL 32210",
    });
  });

  it("returns null without a street number", () => {
    expect(parseSiteAddress("Robin Hood Rd")).toBeNull();
  });
});

describe("formatTaxFolioDisplay", () => {
  it("formats spaced and digit RE numbers", () => {
    expect(formatTaxFolioDisplay("100804 0000")).toBe("100804-0000");
    expect(formatTaxFolioDisplay("1008040000")).toBe("100804-0000");
  });
});

describe("lookupDuvalParcels", () => {
  it("queries ArcGIS with STREET_NO + ST_NAME and maps fields", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        features: [
          {
            attributes: {
              RE: "100804 0000",
              RE_NOSPACE: "1008040000",
              LNAMEOWNER: "COOK FAMILY REVOCABLE TRUST",
              LNAME2: " ",
              STREET_NO: "4212",
              ST_NAME: "ROBIN HOOD",
              ST_TYPE: "RD",
              ADDRCITY: "JACKSONVILLE",
              ZIPCODE: 32210,
              MAILADDR1: "4212 ROBIN HOOD RD",
              MAILCITY: "JACKSONVILLE",
              MAILSTATE: "FL",
              MAILZIP: "32210-5827",
              LEGAL1: "23-7 42-3S-26E",
              LEGAL2: "ORTEGA FOREST UNIT 2",
              LEGAL3: "LOT 24 BLK 6",
              LAT: 30.26,
              LONG: -81.71,
            },
            geometry: { rings: [[[-81.71, 30.26], [-81.7, 30.26], [-81.7, 30.27], [-81.71, 30.26]]] },
          },
        ],
      }),
      text: async () => "",
    }));

    const rows = await lookupDuvalParcels(
      { address: "4212 Robin Hood Rd, Jacksonville FL 32210" },
      { fetch: fetchMock as never },
    );

    expect(fetchMock).toHaveBeenCalledOnce();
    const calls = fetchMock.mock.calls as unknown as ReadonlyArray<ReadonlyArray<unknown>>;
    const url = String(calls[0]?.[0] ?? "");
    expect(url).toContain("maps.coj.net/coj/rest/services/CityBiz/Parcels/MapServer/0/query");
    const decoded = decodeURIComponent(url).replace(/\+/g, " ");
    expect(decoded).toContain("STREET_NO='4212'");
    expect(decoded).toContain("ROBIN HOOD");

    expect(rows).toHaveLength(1);
    expect(rows[0]?.taxFolioDisplay).toBe("100804-0000");
    expect(rows[0]?.ownerOfRecord).toBe("COOK FAMILY REVOCABLE TRUST");
    expect(rows[0]?.legalDescription).toContain("ORTEGA FOREST");
    expect(rows[0]?.mailingCityStateZip).toBe("JACKSONVILLE, FL, 32210-5827");
  });

  it("throws validation when address cannot be parsed", async () => {
    await expect(lookupDuvalParcels({ address: "nowhere" })).rejects.toBeInstanceOf(
      DuvalParcelLookupError,
    );
  });
});

describe("packageFieldsFromParcel / snapshot", () => {
  const sample: DuvalParcelResult = {
    parcelId: "100804 0000",
    parcelIdDigits: "1008040000",
    taxFolioDisplay: "100804-0000",
    ownerOfRecord: "COOK FAMILY REVOCABLE TRUST",
    owners: [{ name: "COOK FAMILY REVOCABLE TRUST" }],
    siteAddress: "4212 ROBIN HOOD RD",
    city: "JACKSONVILLE",
    postalCode: "32210",
    mailingAddressLine1: "4212 ROBIN HOOD RD",
    mailingCityStateZip: "JACKSONVILLE, FL, 32210-5827",
    legalDescription: "ORTEGA FOREST UNIT 2 LOT 24",
    latitude: 30.26,
    longitude: -81.71,
    geometry: null,
    rawAttributes: {},
  };

  it("maps into package fieldValues without inventing fields", () => {
    expect(packageFieldsFromParcel(sample)).toEqual({
      ownerName: "COOK FAMILY REVOCABLE TRUST",
      ownerMailingAddress: "4212 ROBIN HOOD RD",
      ownerCityStateZip: "JACKSONVILLE, FL, 32210-5827",
      legalDescription: "ORTEGA FOREST UNIT 2 LOT 24",
      taxFolio: "100804-0000",
    });
  });

  it("builds a job snapshot with source attribution", () => {
    const snap = toJobParcelSnapshot(sample, new Date("2026-11-02T12:00:00.000Z"));
    expect(snap.source).toBe("maps.coj.net/CityBiz/Parcels");
    expect(snap.parcelId).toBe("100804 0000");
    expect(snap.confirmedAt).toBe("2026-11-02T12:00:00.000Z");
  });
});
