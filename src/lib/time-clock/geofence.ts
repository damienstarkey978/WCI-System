/**
 * Geofence checking for time clock entries. Pure, no database.
 */

const EARTH_RADIUS_METERS = 6_371_000;

/** Great-circle distance between two lat/lng points, in meters (haversine formula). */
export function haversineDistanceMeters(
  fromLatitude: number,
  fromLongitude: number,
  toLatitude: number,
  toLongitude: number,
): number {
  const toRadians = (degrees: number) => (degrees * Math.PI) / 180;

  const deltaLat = toRadians(toLatitude - fromLatitude);
  const deltaLng = toRadians(toLongitude - fromLongitude);
  const lat1 = toRadians(fromLatitude);
  const lat2 = toRadians(toLatitude);

  const a =
    Math.sin(deltaLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return EARTH_RADIUS_METERS * c;
}

export type GeofenceStatus = "INSIDE" | "OUTSIDE" | "NOT_APPLICABLE";

export interface GeofenceJob {
  readonly latitude: number | null;
  readonly longitude: number | null;
  readonly geofenceRadiusMeters: number | null;
}

export interface GpsPoint {
  readonly latitude: number;
  readonly longitude: number;
}

/**
 * Determine geofence status for a clock event.
 *
 * NOT_APPLICABLE — never a failure — whenever there is nothing meaningful to check
 * against: no GPS was captured, or the job has no address/radius configured. A
 * missing geofence should never block a worker from clocking in.
 */
export function checkGeofence(job: GeofenceJob, point: GpsPoint | null): GeofenceStatus {
  if (point === null) return "NOT_APPLICABLE";
  if (job.latitude === null || job.longitude === null || job.geofenceRadiusMeters === null) {
    return "NOT_APPLICABLE";
  }

  const distanceMeters = haversineDistanceMeters(job.latitude, job.longitude, point.latitude, point.longitude);
  return distanceMeters <= job.geofenceRadiusMeters ? "INSIDE" : "OUTSIDE";
}
