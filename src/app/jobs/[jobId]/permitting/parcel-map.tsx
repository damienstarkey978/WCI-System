"use client";

/**
 * Lightweight confirm-step map: OpenStreetMap embed pinned to Duval GIS lat/lng.
 * No Mapbox/Leaflet dependency — geometry rings stay on Job.parcelSnapshot for later.
 */
export function ParcelMap({
  latitude,
  longitude,
  label,
  className,
}: {
  readonly latitude: number;
  readonly longitude: number;
  readonly label?: string;
  readonly className?: string;
}) {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  const delta = 0.004;
  const minLon = longitude - delta;
  const minLat = latitude - delta;
  const maxLon = longitude + delta;
  const maxLat = latitude + delta;
  const bbox = `${minLon}%2C${minLat}%2C${maxLon}%2C${maxLat}`;
  const marker = `${latitude}%2C${longitude}`;
  const src = `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${marker}`;
  const external = `https://www.openstreetmap.org/?mlat=${latitude}&mlon=${longitude}#map=18/${latitude}/${longitude}`;

  return (
    <div className={className ?? "grid gap-1"}>
      {label ? <p className="text-[10px] font-medium text-[var(--bt-muted)]">{label}</p> : null}
      <div
        className="overflow-hidden rounded border bg-[#e8eef2]"
        style={{ borderColor: "var(--bt-border)" }}
      >
        <iframe
          title={label ?? "Parcel map"}
          src={src}
          className="h-44 w-full border-0"
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
        />
      </div>
      <p className="text-[10px] text-[var(--bt-muted)]">
        Pin {latitude.toFixed(5)}, {longitude.toFixed(5)} ·{" "}
        <a
          href={external}
          target="_blank"
          rel="noreferrer"
          className="text-[var(--bt-primary)] hover:underline"
        >
          Open map
        </a>
      </p>
    </div>
  );
}
