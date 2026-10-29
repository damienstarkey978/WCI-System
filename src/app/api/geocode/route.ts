import { NextResponse } from "next/server";

import { currentAppUser } from "@/lib/auth";
import { geocodeAddress } from "@/lib/maps/geocode";

/** Staff-only Nominatim proxy — browser clients cannot call Nominatim (no CORS). */
export async function GET(request: Request) {
  const user = await currentAppUser().catch(() => null);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const q = (searchParams.get("q") ?? "").trim();
  if (!q || q.length > 300) return NextResponse.json({ error: "invalid_query" }, { status: 400 });

  const point = await geocodeAddress(q);
  return NextResponse.json({ data: point });
}
