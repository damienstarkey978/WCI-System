/**
 * Idempotent upload of BT lead proposal PDFs into WCI as LeadAttachments.
 * Does NOT invent Proposal/Estimate rows from price metadata alone —
 * PDFs park on the Lead until a real Estimate-backed Proposal exists.
 *
 * Input: /cursor/stores/self/docs/bt-exports/lead-proposals/
 *   - Flat: `<slug>.pdf` / `<slug>__*.pdf`
 *   - Or per-opp folders: `<slug>/*.pdf` (+ optional manifest.json)
 */
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, basename } from "node:path";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../src/generated/prisma/client";
import { uploadLeadAttachment } from "../../src/lib/crm/attachments";

const ORG = "0a3188e6-e257-49bb-994c-f5d15618608a";
const DAMIEN = "9f121a70-9250-479e-891e-a6b813057416";
const ROOT = "/cursor/stores/self/docs/bt-exports/lead-proposals";

function norm(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function mimeFor(name: string): string | null {
  const n = name.toLowerCase();
  if (n.endsWith(".pdf")) return "application/pdf";
  if (n.endsWith(".xls") || n.endsWith(".xlsx")) return "application/vnd.ms-excel";
  return null;
}

function matchLead(
  leads: Array<{ id: string; title: string | null; name: string }>,
  slugOrTitle: string,
) {
  const slugNorm = norm(slugOrTitle);
  const parts = slugNorm.split(" ").filter((p) => p.length > 2);
  return (
    leads.find((l) => norm(l.title ?? "") === slugNorm) ||
    leads.find((l) => norm(l.title ?? "").includes(slugNorm.slice(0, 24))) ||
    leads.find((l) => {
      const t = norm(`${l.title ?? ""} ${l.name ?? ""}`);
      return parts.slice(0, 3).every((p) => t.includes(p));
    }) ||
    leads.find((l) => {
      const t = norm(l.title ?? "");
      return parts.length >= 2 && t.includes(parts[0]) && t.includes(parts[1]);
    })
  );
}

async function main() {
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
  const leads = await db.lead.findMany({
    where: { organizationId: ORG },
    select: { id: true, title: true, name: true },
  });

  const summary = {
    filesSeen: 0,
    uploaded: 0,
    skippedExisting: 0,
    skippedUnsupported: 0,
    unmatched: [] as string[],
    errors: [] as string[],
  };

  type Item = { matchKey: string; filePath: string; fileName: string };
  const items: Item[] = [];

  for (const entry of readdirSync(ROOT)) {
    if (entry === "targets.json" || entry === "manifest.json") continue;
    const path = join(ROOT, entry);
    const st = statSync(path);
    if (st.isDirectory()) {
      for (const name of readdirSync(path)) {
        if (name === "manifest.json") continue;
        const fp = join(path, name);
        if (!statSync(fp).isFile()) continue;
        items.push({ matchKey: entry, filePath: fp, fileName: name });
      }
    } else if (st.isFile()) {
      // flat: slug.pdf or slug__label.pdf
      const stem = entry.replace(/\.(pdf|xls|xlsx)$/i, "");
      const matchKey = stem.split("__")[0] ?? stem;
      items.push({ matchKey, filePath: path, fileName: entry });
    }
  }

  for (const item of items) {
    summary.filesSeen += 1;
    if (!mimeFor(item.fileName)) {
      summary.skippedUnsupported += 1;
      continue;
    }
    const lead = matchLead(leads, item.matchKey);
    if (!lead) {
      summary.unmatched.push(`${item.matchKey} :: ${item.fileName}`);
      continue;
    }
    // Prefix so proposal PDFs are recognizable among general attachments
    const storedName = item.fileName.toLowerCase().startsWith("proposal-")
      ? item.fileName
      : `proposal-${item.fileName}`;

    const exists = await db.leadAttachment.findFirst({
      where: {
        organizationId: ORG,
        leadId: lead.id,
        OR: [{ fileName: storedName }, { fileName: item.fileName }, { fileName: basename(item.filePath) }],
      },
      select: { id: true },
    });
    if (exists) {
      summary.skippedExisting += 1;
      continue;
    }
    try {
      const bytes = readFileSync(item.filePath);
      await uploadLeadAttachment({
        organizationId: ORG,
        leadId: lead.id,
        uploadedByUserId: DAMIEN,
        fileName: storedName,
        bytes,
        mimeType: mimeFor(item.fileName),
      });
      summary.uploaded += 1;
    } catch (e) {
      summary.errors.push(`${item.fileName}: ${(e as Error).message}`);
    }
  }

  const totalProposalNamed = await db.leadAttachment.count({
    where: { organizationId: ORG, fileName: { startsWith: "proposal-" } },
  });
  const report = { ...summary, totalProposalPrefixedAttachments: totalProposalNamed };
  console.log(JSON.stringify(report, null, 2));
  writeFileSync("/tmp/lead-proposal-pdfs-import.json", JSON.stringify(report, null, 2));
  await db.$disconnect();
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
