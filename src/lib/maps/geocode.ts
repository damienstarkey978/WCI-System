/**
 * Lightweight Nominatim geocoder for Lead Map pins. Server-side only — Nominatim
 * does not send CORS headers, so the browser cannot call it directly.
 */

export type GeocodePoint = { readonly lat: number; readonly lng: number };

const cache = new Map<string, GeocodePoint | null>();

export async function geocodeAddress(address: string): Promise<GeocodePoint | null> {
  const key = address.replace(/\s+/g, " ").trim().toLowerCase();
  if (!key) return null;
  if (cache.has(key)) return cache.get(key) ?? null;

  const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(address)}`;
  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      "User-Agent": "WCI-OS/1.0 (lead-map; worldconstructionjax.com)",
    },
  });
  if (!response.ok) {
    cache.set(key, null);
    return null;
  }
  const rows = (await response.json()) as Array<{ lat: string; lon: string }>;
  const point = rows[0] ? { lat: Number(rows[0].lat), lng: Number(rows[0].lon) } : null;
  cache.set(key, point);
  return point;
}
