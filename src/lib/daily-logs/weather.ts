/**
 * Auto-populated weather for Daily Logs (CLAUDE.md 3). Optional integration, same
 * pattern as Clerk and the AI estimate assistant: without a provider key, weather
 * stays null rather than the app failing or fabricating a value. Any provider can
 * be swapped in behind this one function — DailyLog.weather is a plain Json field.
 */

import { isWeatherConfigured, weatherApiKey } from "@/lib/env";

export interface JobLocation {
  readonly latitude: number | null;
  readonly longitude: number | null;
}

/**
 * Fetch current weather for a job's address. Returns null whenever there is
 * nothing meaningful to attach: no provider configured, no job coordinates, or
 * the provider call itself fails — a weather hiccup must never block creating a
 * daily log.
 */
export async function fetchWeatherForJob(location: JobLocation): Promise<Record<string, unknown> | null> {
  if (!isWeatherConfigured() || location.latitude === null || location.longitude === null) {
    return null;
  }

  try {
    const url = new URL("https://api.openweathermap.org/data/2.5/weather");
    url.searchParams.set("lat", String(location.latitude));
    url.searchParams.set("lon", String(location.longitude));
    url.searchParams.set("units", "imperial");
    url.searchParams.set("appid", weatherApiKey()!);

    const response = await fetch(url, { signal: AbortSignal.timeout(5_000) });
    if (!response.ok) return null;

    const data = (await response.json()) as {
      main?: { temp?: number };
      weather?: { main?: string; description?: string }[];
      wind?: { speed?: number };
    };

    return {
      temperatureF: data.main?.temp ?? null,
      condition: data.weather?.[0]?.main ?? null,
      description: data.weather?.[0]?.description ?? null,
      windMph: data.wind?.speed ?? null,
      fetchedAt: new Date().toISOString(),
    };
  } catch {
    return null;
  }
}
