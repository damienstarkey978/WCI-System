"use client";

import { useState, useTransition } from "react";

import type { DuvalParcelResult } from "@/lib/permitting/duval-parcel";

import { confirmJobParcelAction, lookupDuvalParcelsAction } from "./actions";

export type LockedParcelFields = {
  readonly propertyAddress: string;
  readonly ownerName: string;
  readonly ownerMailingAddress: string;
  readonly ownerCityStateZip: string;
  readonly legalDescription: string;
  readonly taxFolio: string;
  readonly latitude: number | null;
  readonly longitude: number | null;
};

type Props = {
  readonly jobId: string;
  readonly defaultAddress: string;
  readonly initialLocked: LockedParcelFields | null;
  readonly onLocked: (fields: LockedParcelFields) => void;
  readonly onUnlock: () => void;
};

/**
 * Rockstar-style address lock: lookup Duval ArcGIS parcels → staff Confirm.
 * Never invents owner/folio — only persists what the layer returned.
 */
export function AddressLockStep({
  jobId,
  defaultAddress,
  initialLocked,
  onLocked,
  onUnlock,
}: Props) {
  const [address, setAddress] = useState(
    initialLocked?.propertyAddress || defaultAddress,
  );
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<DuvalParcelResult[]>([]);
  const [locked, setLocked] = useState<LockedParcelFields | null>(initialLocked);

  function runLookup() {
    setError(null);
    setCandidates([]);
    startTransition(async () => {
      const result = await lookupDuvalParcelsAction({ address });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      if (result.parcels.length === 0) {
        setError("No Duval parcels matched that address. Check the street number/name.");
        return;
      }
      setCandidates(result.parcels);
    });
  }

  function confirm(parcel: DuvalParcelResult) {
    setError(null);
    startTransition(async () => {
      const result = await confirmJobParcelAction(jobId, parcel);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      const fields: LockedParcelFields = {
        propertyAddress: parcel.siteAddress || address,
        ownerName: result.packageFields.ownerName || parcel.ownerOfRecord || "",
        ownerMailingAddress: result.packageFields.ownerMailingAddress || "",
        ownerCityStateZip: result.packageFields.ownerCityStateZip || "",
        legalDescription: result.packageFields.legalDescription || "",
        taxFolio: result.packageFields.taxFolio || parcel.taxFolioDisplay,
        latitude: parcel.latitude,
        longitude: parcel.longitude,
      };
      setLocked(fields);
      setCandidates([]);
      onLocked(fields);
    });
  }

  function unlock() {
    setLocked(null);
    setCandidates([]);
    onUnlock();
  }

  if (locked) {
    return (
      <div
        className="grid gap-2 rounded border p-3"
        style={{ borderColor: "var(--bt-border)", background: "color-mix(in srgb, var(--bt-primary) 6%, transparent)" }}
      >
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--bt-muted)]">
              Address locked
            </p>
            <p className="text-sm font-medium text-[var(--bt-text)]">{locked.propertyAddress}</p>
          </div>
          <button
            type="button"
            onClick={unlock}
            className="text-xs text-[var(--bt-primary)] hover:underline"
          >
            Unlock / re-lookup
          </button>
        </div>
        <dl className="grid gap-1 text-xs text-[var(--bt-text)] sm:grid-cols-2">
          <div>
            <dt className="text-[var(--bt-muted)]">Tax folio</dt>
            <dd className="font-medium">{locked.taxFolio || "—"}</dd>
          </div>
          <div>
            <dt className="text-[var(--bt-muted)]">Owner of record</dt>
            <dd className="font-medium">{locked.ownerName || "—"}</dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-[var(--bt-muted)]">Mailing</dt>
            <dd className="font-medium">
              {[locked.ownerMailingAddress, locked.ownerCityStateZip].filter(Boolean).join(", ") ||
                "—"}
            </dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-[var(--bt-muted)]">Legal description</dt>
            <dd className="font-medium">{locked.legalDescription || "—"}</dd>
          </div>
        </dl>
        {locked.latitude != null && locked.longitude != null ? (
          <p className="text-[10px] text-[var(--bt-muted)]">
            Map pin {locked.latitude.toFixed(5)}, {locked.longitude.toFixed(5)} (Duval GIS). Parcel
            outline lives in the job parcel snapshot for later map chrome.
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="grid gap-2">
      <label className="grid gap-1">
        <span className="text-xs font-medium text-[var(--bt-muted)]">
          Property address (lock via Duval Property Appraiser GIS)
        </span>
        <input
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          placeholder="4212 Example Rd, Jacksonville FL 32210"
          className="rounded border px-3 py-2 text-sm"
          style={{ borderColor: "var(--bt-border)" }}
        />
      </label>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={pending || !address.trim()}
          onClick={runLookup}
          className="rounded px-3 py-2 text-xs font-semibold text-[var(--bt-on-primary)] disabled:opacity-50"
          style={{ background: "var(--bt-primary)" }}
        >
          {pending ? "Looking up…" : "Look up parcel"}
        </button>
      </div>
      {error ? <p className="text-xs text-[var(--bt-hazard)]">{error}</p> : null}
      {candidates.length > 0 ? (
        <ul className="grid max-h-56 gap-2 overflow-y-auto">
          {candidates.map((p) => (
            <li
              key={p.parcelIdDigits || p.parcelId}
              className="rounded border p-2 text-sm"
              style={{ borderColor: "var(--bt-border)" }}
            >
              <div className="font-medium text-[var(--bt-text)]">{p.siteAddress}</div>
              <div className="text-xs text-[var(--bt-muted)]">
                Folio {p.taxFolioDisplay}
                {p.ownerOfRecord ? ` · ${p.ownerOfRecord}` : ""}
              </div>
              {p.legalDescription ? (
                <div className="mt-0.5 line-clamp-2 text-[10px] text-[var(--bt-muted)]">
                  {p.legalDescription}
                </div>
              ) : null}
              <button
                type="button"
                disabled={pending}
                onClick={() => confirm(p)}
                className="mt-2 rounded px-2.5 py-1.5 text-xs font-semibold text-[var(--bt-on-primary)] disabled:opacity-50"
                style={{ background: "var(--bt-primary)" }}
              >
                Confirm &amp; lock
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <p className="text-[10px] text-[var(--bt-muted)]">
        Pulls live data from maps.coj.net CityBiz/Parcels. Owner and folio are never invented —
        confirm the match before continuing.
      </p>
    </div>
  );
}
