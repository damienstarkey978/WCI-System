"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

import type { WaterService } from "@/lib/permitting/docs";

export function PermitDocsForm({
  jobId,
  waterService,
  bathroomAdd,
}: {
  jobId: string;
  waterService: WaterService;
  bathroomAdd: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function push(next: { water?: WaterService; bathroom?: boolean }) {
    const water = next.water ?? waterService;
    const bathroom = next.bathroom ?? bathroomAdd;
    const params = new URLSearchParams();
    params.set("water", water);
    if (bathroom) params.set("bathroom", "1");
    startTransition(() => {
      router.replace(`/jobs/${jobId}/permitting/docs?${params.toString()}`);
    });
  }

  return (
    <div className={`flex flex-col gap-3 ${pending ? "opacity-70" : ""}`}>
      <label className="flex flex-col gap-1 text-xs font-medium text-[var(--bt-muted)]">
        Water service
        <select
          value={waterService}
          onChange={(event) => push({ water: event.target.value as WaterService })}
          className="rounded border bg-white px-2.5 py-2 text-xs text-[var(--bt-text)]"
          style={{ borderColor: "var(--bt-border)" }}
        >
          <option value="UNKNOWN">Not set yet</option>
          <option value="CITY">City water (JEA)</option>
          <option value="SEPTIC">Septic</option>
        </select>
      </label>
      <label className="flex items-center gap-2 text-xs text-[var(--bt-text)]">
        <input
          type="checkbox"
          checked={bathroomAdd}
          onChange={(event) => push({ bathroom: event.target.checked })}
          className="h-4 w-4"
        />
        Bathroom addition in scope
      </label>
    </div>
  );
}
