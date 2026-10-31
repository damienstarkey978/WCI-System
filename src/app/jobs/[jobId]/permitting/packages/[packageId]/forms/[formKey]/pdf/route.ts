import { NextResponse } from "next/server";

import { currentAppUser } from "@/lib/auth";
import {
  generateFilledFormPdf,
  getPermitPackage,
  PermitPackageError,
} from "@/lib/permitting/packages";

export const dynamic = "force-dynamic";

/**
 * Download a filled official form PDF for a package.
 * Regenerates from package field values + org license/NOC preset — never submits externally.
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ jobId: string; packageId: string; formKey: string }> },
) {
  const { jobId, packageId, formKey } = await context.params;

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

    const pkg = await generateFilledFormPdf(user.organizationId, packageId, formKey);
    return new NextResponse(Buffer.from(pkg.bytes), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${pkg.fileName}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    if (error instanceof PermitPackageError) {
      const status = error.code === "not_found" ? 404 : error.code === "unavailable" ? 404 : 400;
      return NextResponse.json({ error: error.message }, { status });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not fill PDF." },
      { status: 500 },
    );
  }
}
