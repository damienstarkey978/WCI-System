/**
 * GET /api/v1/parcels/duval — Duval County parcel lookup (CityBiz/Parcels ArcGIS).
 * Query: address=… | streetNo=&streetName= | re=
 * Never invents results — returns upstream features only. No external submit.
 */

import { apiError, withApiAuth } from "@/lib/api-auth";
import {
  DuvalParcelLookupError,
  lookupDuvalParcels,
} from "@/lib/permitting/duval-parcel";

export const GET = withApiAuth(["permits:read"], async (request) => {
  const url = new URL(request.url);
  const address = url.searchParams.get("address")?.trim() || undefined;
  const streetNo = url.searchParams.get("streetNo")?.trim() || undefined;
  const streetName = url.searchParams.get("streetName")?.trim() || undefined;
  const re = url.searchParams.get("re")?.trim() || undefined;

  if (!address && !re && !(streetNo && streetName)) {
    return apiError(
      400,
      "validation_failed",
      "Provide address, re, or streetNo+streetName.",
    );
  }

  try {
    const results = await lookupDuvalParcels({ address, streetNo, streetName, re });
    return Response.json({
      data: {
        count: results.length,
        parcels: results.map((p) => ({
          parcelId: p.parcelId,
          parcelIdDigits: p.parcelIdDigits,
          taxFolioDisplay: p.taxFolioDisplay,
          ownerOfRecord: p.ownerOfRecord,
          owners: p.owners,
          siteAddress: p.siteAddress,
          city: p.city,
          postalCode: p.postalCode,
          mailingAddressLine1: p.mailingAddressLine1,
          mailingCityStateZip: p.mailingCityStateZip,
          legalDescription: p.legalDescription,
          latitude: p.latitude,
          longitude: p.longitude,
          geometry: p.geometry,
        })),
        source: "maps.coj.net/CityBiz/Parcels",
      },
    });
  } catch (error) {
    if (error instanceof DuvalParcelLookupError) {
      const status = error.code === "upstream" ? 502 : error.code === "not_found" ? 404 : 422;
      return apiError(status, error.code === "upstream" ? "upstream_error" : "validation_failed", error.message);
    }
    throw error;
  }
});
