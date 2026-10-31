import { readdirSync, readFileSync, statSync, existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../src/generated/prisma/client";
import { uploadLeadAttachment } from "../../src/lib/crm/attachments";

const ORG = "0a3188e6-e257-49bb-994c-f5d15618608a";
const DAMIEN = "9f121a70-9250-479e-891e-a6b813057416";
const ROOT = "/cursor/stores/self/docs/bt-exports/lead-attachments";

function norm(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function mimeFor(name: string): string | null {
  const n = name.toLowerCase();
  if (n.endsWith(".jpg") || n.endsWith(".jpeg")) return "image/jpeg";
  if (n.endsWith(".png")) return "image/png";
  if (n.endsWith(".pdf")) return "application/pdf";
  if (n.endsWith(".heic")) return "image/heic";
  return null;
}

async function main() {
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
  const leads = await db.lead.findMany({
    where: { organizationId: ORG },
    select: { id: true, title: true, name: true },
  });

  const summary = {
    folders: 0,
    uploaded: 0,
    skippedExisting: 0,
    unmatchedFolders: [] as string[],
    errors: [] as string[],
  };

  for (const slug of readdirSync(ROOT)) {
    const dir = join(ROOT, slug);
    if (!statSync(dir).isDirectory()) continue;
    summary.folders += 1;

    // match lead by slug tokens vs title
    const slugNorm = norm(slug);
    const lead =
      leads.find((l) => norm(l.title ?? "").includes(slugNorm.slice(0, 20))) ||
      leads.find((l) => {
        const t = norm(l.title ?? l.name);
        const parts = slugNorm.split(" ").filter((p) => p.length > 3);
        return parts.slice(0, 3).every((p) => t.includes(p));
      });

    if (!lead) {
      summary.unmatchedFolders.push(slug);
      continue;
    }

    const walk = (d: string): string[] => {
      const out: string[] = [];
      for (const name of readdirSync(d)) {
        const p = join(d, name);
        if (statSync(p).isDirectory()) out.push(...walk(p));
        else if (name !== "manifest.json") out.push(p);
      }
      return out;
    };
    const files = walk(dir);
    const existing = await db.leadAttachment.findMany({
      where: { organizationId: ORG, leadId: lead.id },
      select: { fileName: true },
    });
    const have = new Set(existing.map((e) => e.fileName));

    for (const filePath of files) {
      const fileName = filePath.split("/").pop()!;
      if (have.has(fileName)) {
        summary.skippedExisting += 1;
        continue;
      }
      try {
        const bytes = readFileSync(filePath);
        await uploadLeadAttachment({
          organizationId: ORG,
          leadId: lead.id,
          uploadedByUserId: DAMIEN,
          fileName,
          bytes,
          mimeType: mimeFor(fileName),
        });
        have.add(fileName);
        summary.uploaded += 1;
      } catch (e) {
        summary.errors.push(`${slug}/${fileName}: ${(e as Error).message}`);
      }
    }
  }

  const total = await db.leadAttachment.count({ where: { organizationId: ORG } });
  const report = { ...summary, totalLeadAttachments: total };
  console.log(JSON.stringify(report, null, 2));
  writeFileSync("/tmp/lead-attachments-import.json", JSON.stringify(report, null, 2));
  await db.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
