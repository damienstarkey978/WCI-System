/**
 * Scope of Values — WCI-branded generated PDF (not a Jacksonville.gov blank).
 * Trade sections come from the org cost-code parent groups; dollar values from
 * the job Budget commitment funnel (revisedBudgetCost / revisedClientPrice).
 * Money stays in integer cents until formatCents for display. Never invents
 * city form wording or fabricated line amounts.
 */

import { readFileSync } from "node:fs";
import path from "node:path";

import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

import { getJobBudget, JobNotFoundError } from "@/lib/budget/service";
import { BRAND_LOGO_LIGHT_PATH } from "@/lib/branding/logo";
import { formatCents, type Cents } from "@/lib/money";
import type { PackageFillContext } from "@/lib/permitting/package-form-fill";

export const SCOPE_OF_VALUES_FORM_KEY = "scope_of_values" as const;

export type SovAmountField = "revisedBudgetCost" | "revisedClientPrice";

export type SovSectionLine = {
  readonly costCodeId: string;
  readonly code: string;
  readonly name: string;
  readonly amountCents: Cents;
};

export type SovSection = {
  readonly key: string;
  readonly title: string;
  readonly lines: readonly SovSectionLine[];
  readonly subtotalCents: Cents;
};

export type ScopeOfValuesData = {
  readonly jobId: string;
  readonly jobName: string;
  readonly amountField: SovAmountField;
  readonly sections: readonly SovSection[];
  readonly grandTotalCents: Cents;
  readonly sourceEstimateTitle: string | null;
  /** True when the job has no budget lines — PDF still generates empty sections. */
  readonly emptyBudget: boolean;
};

/**
 * Map a cost-code parent (or the code itself when ungrouped) onto a Scope of Values
 * trade section. Uses real WCI catalog group names — never invents trade titles.
 */
export function sovSectionKeyForCostCode(input: {
  readonly code: string;
  readonly name: string;
  readonly parentCode: string | null;
  readonly parentName: string | null;
}): { readonly key: string; readonly title: string } {
  if (input.parentCode && input.parentName) {
    return { key: input.parentCode, title: input.parentName };
  }
  // Top-level / ungrouped: section is the code itself.
  return { key: input.code, title: input.name };
}

export function buildScopeOfValuesFromBudget(
  budget: Awaited<ReturnType<typeof getJobBudget>>,
  amountField: SovAmountField = "revisedBudgetCost",
): ScopeOfValuesData {
  const sectionMap = new Map<string, { title: string; lines: SovSectionLine[] }>();

  for (const line of budget.funnel.lines) {
    const meta = budget.costCodes[line.costCodeId];
    if (!meta) continue;
    const amountCents =
      amountField === "revisedClientPrice"
        ? line.revisedClientPriceCents
        : line.revisedBudgetCostCents;
    // Skip zero-dollar noise; never invent non-zero amounts.
    if (!amountCents) continue;

    const section = sovSectionKeyForCostCode({
      code: meta.code,
      name: meta.name,
      parentCode: meta.group?.code ?? null,
      parentName: meta.group?.name ?? null,
    });
    const bucket = sectionMap.get(section.key) ?? { title: section.title, lines: [] };
    bucket.lines.push({
      costCodeId: line.costCodeId,
      code: meta.code,
      name: meta.name,
      amountCents,
    });
    sectionMap.set(section.key, bucket);
  }

  const sections: SovSection[] = [...sectionMap.entries()]
    .map(([key, value]) => {
      const lines = [...value.lines].sort((a, b) => a.code.localeCompare(b.code));
      const subtotalCents = lines.reduce((sum, l) => sum + l.amountCents, 0);
      return { key, title: value.title, lines, subtotalCents };
    })
    .sort((a, b) => a.key.localeCompare(b.key));

  const grandTotalCents = sections.reduce((sum, s) => sum + s.subtotalCents, 0);

  return {
    jobId: budget.job.id,
    jobName: budget.job.name,
    amountField,
    sections,
    grandTotalCents,
    sourceEstimateTitle: budget.sourceEstimate?.title ?? null,
    emptyBudget: sections.length === 0,
  };
}

export async function loadScopeOfValuesForJob(
  organizationId: string,
  jobId: string,
  amountField: SovAmountField = "revisedBudgetCost",
): Promise<ScopeOfValuesData> {
  const budget = await getJobBudget(jobId, organizationId);
  return buildScopeOfValuesFromBudget(budget, amountField);
}

function logoBytes(): Uint8Array | null {
  try {
    const filePath = path.join(process.cwd(), "public", BRAND_LOGO_LIGHT_PATH.replace(/^\//, ""));
    return new Uint8Array(readFileSync(filePath));
  } catch {
    return null;
  }
}

/**
 * Compose a multi-page WCI Scope of Values PDF from real budget numbers.
 * Empty budget → cover explaining no lines yet (never fabricates dollars).
 */
export async function composeScopeOfValuesPdf(
  ctx: Pick<PackageFillContext, "packageName" | "propertyAddress" | "taxFolio" | "owner">,
  data: ScopeOfValuesData,
): Promise<Uint8Array> {
  const out = await PDFDocument.create();
  const font = await out.embedFont(StandardFonts.Helvetica);
  const bold = await out.embedFont(StandardFonts.HelveticaBold);
  const ink = rgb(0.12, 0.14, 0.18);
  const muted = rgb(0.35, 0.38, 0.42);
  const rule = rgb(0.75, 0.78, 0.82);

  let logoImage: Awaited<ReturnType<typeof out.embedPng>> | null = null;
  const logo = logoBytes();
  if (logo) {
    try {
      logoImage = await out.embedPng(logo);
    } catch {
      logoImage = null;
    }
  }

  const amountLabel =
    data.amountField === "revisedClientPrice" ? "Revised client price" : "Revised budget cost";

  const newPage = () => {
    const page = out.addPage([612, 792]);
    return { page, y: 752 };
  };

  let { page, y } = newPage();

  const ensureSpace = (need: number) => {
    if (y - need < 48) {
      ({ page, y } = newPage());
    }
  };

  const draw = (
    text: string,
    opts?: { size?: number; bold?: boolean; color?: ReturnType<typeof rgb>; x?: number },
  ) => {
    const size = opts?.size ?? 10;
    ensureSpace(size + 8);
    page.drawText(text.slice(0, 110), {
      x: opts?.x ?? 48,
      y,
      size,
      font: opts?.bold ? bold : font,
      color: opts?.color ?? ink,
    });
    y -= size + 5;
  };

  if (logoImage) {
    const dims = logoImage.scale(0.35);
    page.drawImage(logoImage, { x: 48, y: y - dims.height + 12, width: dims.width, height: dims.height });
    y -= dims.height + 8;
  }

  draw("World Construction Inc. — Scope of Values", { size: 14, bold: true });
  draw("WCI-generated worksheet for the permit package (not a city blank).", {
    size: 9,
    color: muted,
  });
  y -= 4;
  draw(`Package: ${ctx.packageName || "—"}`, { bold: true });
  draw(`Job: ${data.jobName}`);
  draw(`Project address: ${ctx.propertyAddress || "—"}`);
  draw(`Tax folio: ${ctx.taxFolio || "—"}`);
  draw(`Owner: ${ctx.owner.name || "—"}`);
  draw(`Amount basis: ${amountLabel}`);
  if (data.sourceEstimateTitle) {
    draw(`Budget source estimate: ${data.sourceEstimateTitle}`);
  }
  y -= 6;
  page.drawLine({ start: { x: 48, y }, end: { x: 564, y }, thickness: 0.5, color: rule });
  y -= 14;

  if (data.emptyBudget) {
    draw("No budget line amounts on this job yet.", { bold: true });
    draw(
      "Send an estimate to budget (or enter budget lines) before treating Scope of Values as complete.",
      { size: 9, color: muted },
    );
    draw("WCI does not invent dollar amounts or city form wording.", { size: 9, color: muted });
    return out.save();
  }

  for (const section of data.sections) {
    ensureSpace(40);
    draw(section.title, { size: 11, bold: true });
    for (const line of section.lines) {
      ensureSpace(16);
      const left = `${line.code}  ${line.name}`.slice(0, 70);
      const right = formatCents(line.amountCents);
      page.drawText(left, { x: 56, y, size: 9, font, color: ink });
      const rightWidth = bold.widthOfTextAtSize(right, 9);
      page.drawText(right, { x: 564 - rightWidth, y, size: 9, font: bold, color: ink });
      y -= 14;
    }
    ensureSpace(18);
    const sub = `Section subtotal  ${formatCents(section.subtotalCents)}`;
    const subWidth = bold.widthOfTextAtSize(sub, 9);
    page.drawText(sub, { x: 564 - subWidth, y, size: 9, font: bold, color: muted });
    y -= 18;
  }

  y -= 4;
  page.drawLine({ start: { x: 48, y }, end: { x: 564, y }, thickness: 1, color: rule });
  y -= 16;
  draw(`Grand total  ${formatCents(data.grandTotalCents)}`, { size: 12, bold: true });
  y -= 8;
  draw("Amounts are from the job budget commitment funnel (integer cents). WCI does not submit this to the city.", {
    size: 8,
    color: muted,
  });

  return out.save();
}

export { JobNotFoundError };
