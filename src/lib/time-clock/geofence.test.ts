import { describe, expect, it } from "vitest";

import { checkGeofence, haversineDistanceMeters } from "@/lib/time-clock/geofence";

describe("haversineDistanceMeters", () => {
  it("returns zero for identical points", () => {
    expect(haversineDistanceMeters(30.3322, -81.6557, 30.3322, -81.6557)).toBe(0);
  });

  it("computes a known real-world distance within a reasonable tolerance", () => {
    // Jacksonville, FL to Orlando, FL is roughly 200 km.
    const distance = haversineDistanceMeters(30.3322, -81.6557, 28.5384, -81.3789);
    expect(distance).toBeGreaterThan(190_000);
    expect(distance).toBeLessThan(210_000);
  });

  it("is symmetric", () => {
    const a = haversineDistanceMeters(30.0, -81.0, 30.1, -81.1);
    const b = haversineDistanceMeters(30.1, -81.1, 30.0, -81.0);
    expect(a).toBeCloseTo(b, 6);
  });
});

const JOB = { latitude: 30.3322, longitude: -81.6557, geofenceRadiusMeters: 200 };

describe("checkGeofence", () => {
  it("is NOT_APPLICABLE when no GPS point is given", () => {
    expect(checkGeofence(JOB, null)).toBe("NOT_APPLICABLE");
  });

  it("is NOT_APPLICABLE when the job has no geofence radius configured", () => {
    expect(
      checkGeofence({ ...JOB, geofenceRadiusMeters: null }, { latitude: 30.3322, longitude: -81.6557 }),
    ).toBe("NOT_APPLICABLE");
  });

  it("is NOT_APPLICABLE when the job has no address at all", () => {
    expect(
      checkGeofence(
        { latitude: null, longitude: null, geofenceRadiusMeters: 200 },
        { latitude: 30.3322, longitude: -81.6557 },
      ),
    ).toBe("NOT_APPLICABLE");
  });

  it("is INSIDE at the exact job location", () => {
    expect(checkGeofence(JOB, { latitude: JOB.latitude, longitude: JOB.longitude })).toBe("INSIDE");
  });

  it("is OUTSIDE well beyond the radius", () => {
    expect(checkGeofence(JOB, { latitude: 30.5, longitude: -81.8 })).toBe("OUTSIDE");
  });

  it("treats the radius boundary as inside (inclusive)", () => {
    // Roughly 0.0018 degrees of latitude is about 200m.
    expect(checkGeofence(JOB, { latitude: JOB.latitude + 0.0001, longitude: JOB.longitude })).toBe("INSIDE");
  });
});
