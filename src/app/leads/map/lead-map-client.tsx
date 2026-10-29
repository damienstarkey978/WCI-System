"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";

export interface LeadMapPin {
  readonly id: string;
  readonly label: string;
  readonly stage: string;
  readonly address: string;
  readonly href: string;
}

const STAGE_STYLE: Record<string, { bg: string; text: string }> = {
  NEW: { bg: "#e5e7eb", text: "#374151" },
  CONTACTED: { bg: "color-mix(in srgb, var(--bt-primary) 14%, transparent)", text: "var(--bt-primary)" },
  QUALIFIED: { bg: "color-mix(in srgb, var(--bt-hazard) 14%, transparent)", text: "var(--bt-hazard)" },
  PROPOSAL_SENT: { bg: "color-mix(in srgb, var(--bt-primary) 14%, transparent)", text: "var(--bt-primary)" },
  WON: { bg: "var(--bt-status-open-bg)", text: "var(--bt-status-open-text)" },
  LOST: { bg: "color-mix(in srgb, var(--bt-danger) 14%, transparent)", text: "var(--bt-danger)" },
};

declare global {
  interface Window {
    L?: {
      map: (el: HTMLElement, opts?: object) => {
        setView: (latlng: [number, number], zoom: number) => unknown;
        fitBounds: (bounds: unknown, opts?: object) => unknown;
        remove: () => void;
      };
      tileLayer: (url: string, opts?: object) => { addTo: (map: unknown) => unknown };
      marker: (latlng: [number, number]) => {
        addTo: (map: unknown) => { bindPopup: (html: string) => unknown };
      };
      latLngBounds: (latlngs: Array<[number, number]>) => unknown;
    };
  }
}

function loadLeaflet(): Promise<NonNullable<typeof window.L>> {
  return new Promise((resolve, reject) => {
    if (window.L) {
      resolve(window.L);
      return;
    }
    if (!document.querySelector('link[data-leaflet="1"]')) {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
      link.dataset.leaflet = "1";
      document.head.appendChild(link);
    }
    const existing = document.querySelector('script[data-leaflet="1"]') as HTMLScriptElement | null;
    if (existing) {
      existing.addEventListener("load", () => (window.L ? resolve(window.L) : reject(new Error("Leaflet failed"))));
      return;
    }
    const script = document.createElement("script");
    script.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
    script.async = true;
    script.dataset.leaflet = "1";
    script.onload = () => (window.L ? resolve(window.L) : reject(new Error("Leaflet failed")));
    script.onerror = () => reject(new Error("Leaflet failed"));
    document.body.appendChild(script);
  });
}

async function geocodeViaApi(address: string): Promise<{ lat: number; lng: number } | null> {
  const response = await fetch(`/api/geocode?q=${encodeURIComponent(address)}`);
  if (!response.ok) return null;
  const body = (await response.json()) as { data: { lat: number; lng: number } | null };
  return body.data;
}

/**
 * OpenStreetMap tiles via Leaflet (CDN). Pins geocode through /api/geocode
 * (Nominatim proxy) because the browser cannot call Nominatim directly.
 */
export function LeadMapClient({ pins }: { readonly pins: readonly LeadMapPin[] }) {
  const mapId = useId().replace(/:/g, "");
  const containerRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "empty" | "error">("loading");
  const [placed, setPlaced] = useState(0);

  useEffect(() => {
    let cancelled = false;
    let mapInstance: ReturnType<NonNullable<typeof window.L>["map"]> | null = null;

    async function run() {
      const withAddress = pins.filter((pin) => pin.address.trim().length > 0);
      if (withAddress.length === 0) {
        if (!cancelled) setStatus("empty");
        return;
      }

      try {
        const L = await loadLeaflet();
        if (cancelled || !containerRef.current) return;

        mapInstance = L.map(containerRef.current);
        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
          attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
          maxZoom: 19,
        }).addTo(mapInstance);
        // Jacksonville metro default while pins geocode.
        mapInstance.setView([30.3322, -81.6557], 10);
        if (!cancelled) setStatus("ready");

        const latlngs: Array<[number, number]> = [];
        for (const pin of withAddress.slice(0, 40)) {
          if (cancelled) return;
          const point = await geocodeViaApi(pin.address);
          // Nominatim ≤1 req/sec — the proxy is shared, so pause between pins.
          await new Promise((resolve) => setTimeout(resolve, 1100));
          if (!point || cancelled || !mapInstance) continue;
          latlngs.push([point.lat, point.lng]);
          const style = STAGE_STYLE[pin.stage] ?? STAGE_STYLE.NEW;
          L.marker([point.lat, point.lng])
            .addTo(mapInstance)
            .bindPopup(
              `<div style="font: 12px/1.4 system-ui,sans-serif"><a href="${pin.href}"><strong>${escapeHtml(pin.label)}</strong></a><div style="margin-top:4px"><span style="background:${style.bg};color:${style.text};padding:1px 6px;border-radius:4px;font-size:10px;font-weight:600">${escapeHtml(pin.stage)}</span></div><div style="margin-top:4px;color:#555">${escapeHtml(pin.address)}</div></div>`,
            );
          if (!cancelled) setPlaced((count) => count + 1);
        }

        if (!cancelled && mapInstance && latlngs.length > 0) {
          if (latlngs.length === 1) mapInstance.setView(latlngs[0], 13);
          else mapInstance.fitBounds(L.latLngBounds(latlngs), { padding: [32, 32] });
        }
      } catch {
        if (!cancelled) setStatus("error");
      }
    }

    void run();
    return () => {
      cancelled = true;
      mapInstance?.remove();
    };
  }, [pins]);

  return (
    <div className="flex flex-col gap-3">
      <div className="relative overflow-hidden rounded-lg border bg-[var(--bt-panel-bg)]" style={{ borderColor: "var(--bt-border)" }}>
        <div id={`lead-map-${mapId}`} ref={containerRef} className="h-[28rem] w-full" />
        {status === "loading" ? (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-[var(--bt-panel-bg)]/80 text-sm text-[var(--bt-muted)]">
            Loading OpenStreetMap tiles…
          </div>
        ) : null}
        {status === "empty" ? (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-[var(--bt-panel-bg)] text-sm text-[var(--bt-muted)]">
            No leads with addresses to place.
          </div>
        ) : null}
        {status === "error" ? (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-[var(--bt-panel-bg)] text-sm text-[var(--bt-danger)]">
            Map tiles could not load. Use the list below.
          </div>
        ) : null}
      </div>
      {status === "ready" ? (
        <p className="text-xs text-[var(--bt-muted)]">
          OpenStreetMap tiles · {placed} pin{placed === 1 ? "" : "s"} placed (geocoding continues in the background).
        </p>
      ) : null}

      <div className="overflow-x-auto rounded-lg border bg-[var(--bt-panel-bg)]" style={{ borderColor: "var(--bt-border)" }}>
        <table className="w-full min-w-[36rem] text-left text-sm">
          <thead>
            <tr className="border-b text-xs font-semibold uppercase tracking-wide text-[var(--bt-muted)]" style={{ borderColor: "var(--bt-border)" }}>
              <th className="px-4 py-3">Lead</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Address</th>
            </tr>
          </thead>
          <tbody>
            {pins.map((pin) => {
              const style = STAGE_STYLE[pin.stage] ?? STAGE_STYLE.NEW;
              return (
                <tr key={pin.id} className="border-b last:border-0" style={{ borderColor: "var(--bt-border)" }}>
                  <td className="px-4 py-3 font-medium text-[var(--bt-text)]">
                    <Link href={pin.href} className="hover:underline">
                      {pin.label}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <span className="rounded px-1.5 py-0.5 text-xs font-semibold" style={{ background: style.bg, color: style.text }}>
                      {pin.stage}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-[var(--bt-text)]">{pin.address || "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
