import { NextResponse } from "next/server";

import { currentAppUser } from "@/lib/auth";
import {
  generateMergedPackagePdf,
  getPermitPackage,
  PermitPackageError,
} from "@/lib/permitting/packages";

export const dynamic = "force-dynamic";

/**
 * Download a merged package PDF (all sourced forms, form order).
 * Regenerates fills from package fields — never submits externally.
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ jobId: string; packageId: string }> },
) {
  const { jobId, packageId } = await context.params;

  let user;
  try {
    user = await currentAppUser();
  } catch {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }
  if (!user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  try {
    const row = await getPermitPackage(user.organizationId, packageId);
    if (row.jobId !== jobId) {
      return NextResponse.json({ error: "Package not on this job." }, { status: 404 });
    }

    const pkg = await generateMergedPackagePdf(user.organizationId, packageId);
    return new NextResponse(Buffer.from(pkg.bytes), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${pkg.fileName}"`,
        "Cache-Control": "no-store",
        "X-WCI-Form-Count": String(pkg.formCount),
      },
    });
  } catch (error) {
    if (error instanceof PermitPackageError) {
      const status = error.code === "not_found" ? 404 : error.code === "unavailable" ? 404 : 400;
      return NextResponse.json({ error: error.message }, { status });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not build package PDF." },
      { status: 500 },
    );
  }
}
