import { NextResponse } from "next/server";

import { currentAppUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { resolveLineUnit } from "@/lib/estimates/units";

export const dynamic = "force-dynamic";

/** CSV export of estimate line items — Handoff Convert to → CSV. */
export async function GET(_request: Request, context: { params: Promise<{ estimateId: string }> }) {
  const { estimateId } = await context.params;
  const user = await currentAppUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const estimate = await db.estimate.findFirst({
    where: { id: estimateId, organizationId: user.organizationId },
    include: {
      lineItems: {
        orderBy: { sortOrder: "asc" },
        include: { costCode: { select: { code: true, name: true } } },
      },
    },
  });
  if (!estimate) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const header = ["Group", "Item", "Cost code", "Qty", "Unit", "Unit cost", "Cost type", "Markup %", "Client total"];
  const rows = estimate.lineItems.map((item) => {
    const qty = item.quantityMilli / 1_000;
    const builder = Math.round((item.quantityMilli * item.unitCostCents) / 1_000);
    const client =
      item.rateMode === "MARGIN"
        ? Math.round(builder / (1 - item.rateBasisPoints / 10_000))
        : Math.round(builder * (1 + item.rateBasisPoints / 10_000));
    return [
      csv(item.groupLabel ?? "Ungrouped"),
      csv(item.title),
      csv(`${item.costCode.code} ${item.costCode.name}`),
      String(qty),
      csv(resolveLineUnit(item.unit, item.costType)),
      (item.unitCostCents / 100).toFixed(2),
      item.costType,
      (item.rateBasisPoints / 100).toFixed(2),
      (client / 100).toFixed(2),
    ].join(",");
  });

  const body = [header.join(","), ...rows].join("\n");
  const filename = `${estimate.title.replace(/[^\w.-]+/g, "_").slice(0, 60) || "estimate"}.csv`;
  return new NextResponse(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}

function csv(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}
