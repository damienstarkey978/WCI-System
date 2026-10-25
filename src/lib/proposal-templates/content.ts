/**
 * The Json shapes stored on ProposalTemplate.sections / .draws, validated in one
 * place so the UI, the REST API and Jarvis all write the same thing. Pure (no db)
 * so it is unit-testable.
 */

import { z } from "zod";

export const templateSectionSchema = z.object({
  title: z.string().trim().min(1).max(200),
  bullets: z.array(z.string().trim().min(1).max(2000)).max(50).default([]),
});

export const templateDrawSchema = z.object({
  title: z.string().trim().min(1).max(200),
  /** Basis points of the contract price (10_000 = 100%). */
  pctOfContractBasisPoints: z.number().int().min(1).max(10_000),
});

export const proposalTemplateContentSchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    description: z.string().trim().max(2000).nullish(),
    coverMessage: z.string().trim().max(20_000).nullish(),
    sections: z.array(templateSectionSchema).max(50).default([]),
    draws: z.array(templateDrawSchema).max(20).default([]),
  })
  .refine((value) => value.draws.reduce((sum, draw) => sum + draw.pctOfContractBasisPoints, 0) <= 10_000, {
    message: "The payment schedule adds up to more than 100% of the contract.",
    path: ["draws"],
  });

export type ProposalTemplateContent = z.infer<typeof proposalTemplateContentSchema>;
export type TemplateSection = z.infer<typeof templateSectionSchema>;
export type TemplateDraw = z.infer<typeof templateDrawSchema>;

/** Reads a stored Json column back into typed rows, dropping anything malformed instead of throwing. */
export function readTemplateSections(value: unknown): TemplateSection[] {
  const parsed = z.array(templateSectionSchema).safeParse(value);
  return parsed.success ? parsed.data : [];
}

export function readTemplateDraws(value: unknown): TemplateDraw[] {
  const parsed = z.array(templateDrawSchema).safeParse(value);
  return parsed.success ? parsed.data : [];
}

/**
 * Turns the plain-text editor format used by the UI (and handy for Jarvis) into
 * sections: a line starting with "# " opens a section, every other non-empty line
 * under it is a bullet (a leading "- " or "* " is stripped).
 */
export function parseSectionsText(text: string): TemplateSection[] {
  const sections: TemplateSection[] = [];
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    if (line.startsWith("# ")) {
      sections.push({ title: line.slice(2).trim(), bullets: [] });
      continue;
    }
    const bullet = line.replace(/^[-*]\s+/, "").trim();
    if (!bullet) continue;
    if (sections.length === 0) sections.push({ title: "Scope of work", bullets: [] });
    sections[sections.length - 1].bullets.push(bullet);
  }
  return sections.filter((section) => section.title.length > 0);
}

export function sectionsToText(sections: readonly TemplateSection[]): string {
  return sections.map((section) => [`# ${section.title}`, ...section.bullets.map((bullet) => `- ${bullet}`)].join("\n")).join("\n\n");
}

/** "Deposit | 30" per line (percent), to basis points. Lines that do not parse are skipped. */
export function parseDrawsText(text: string): TemplateDraw[] {
  const draws: TemplateDraw[] = [];
  for (const rawLine of text.split(/\r?\n/)) {
    const [titlePart, pctPart] = rawLine.split("|").map((part) => part?.trim());
    if (!titlePart || !pctPart) continue;
    const pct = Number(pctPart.replace("%", ""));
    if (!Number.isFinite(pct) || pct <= 0) continue;
    draws.push({ title: titlePart, pctOfContractBasisPoints: Math.round(pct * 100) });
  }
  return draws;
}

export function drawsToText(draws: readonly TemplateDraw[]): string {
  return draws.map((draw) => `${draw.title} | ${draw.pctOfContractBasisPoints / 100}`).join("\n");
}
