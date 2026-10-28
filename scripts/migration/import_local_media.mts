/**
 * Upload already-harvested media files from the store into WCI via uploadAndRegisterFile.
 *
 *   DATABASE_URL=… SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… \
 *     npx tsx scripts/migration/import_local_media.mts \
 *       --dir /path/to/docs/bt-exports/media \
 *       --job-map /path/to/bt-to-wci-job-map.json
 */
import "dotenv/config";
import { createReadStream, existsSync, readdirSync, readFileSync, statSync } from "fs";
import { join, extname } from "path";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../src/generated/prisma/client";
import { uploadAndRegisterFile } from "../../src/lib/files/service";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("DATABASE_URL required");
  process.exit(1);
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

function parseArgs(argv: string[]) {
  const out: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const t = argv[i];
    if (!t.startsWith("--")) continue;
    const k = t.slice(2);
    const n = argv[i + 1];
    if (!n || n.startsWith("--")) out[k] = "true";
    else {
      out[k] = n;
      i++;
    }
  }
  return out;
}

function mimeFor(name: string): string {
  const e = extname(name).toLowerCase();
  if (e === ".jpg" || e === ".jpeg") return "image/jpeg";
  if (e === ".png") return "image/png";
  if (e === ".gif") return "image/gif";
  if (e === ".webp") return "image/webp";
  if (e === ".pdf") return "application/pdf";
  if (e === ".zip") return "application/zip";
  if (e === ".heic") return "image/heic";
  return "application/octet-stream";
}

function categoryFor(name: string, folderHint?: string): "PHOTO" | "DOCUMENT" | "PLAN" {
  const lower = `${name} ${folderHint ?? ""}`.toLowerCase();
  if (/\.(jpe?g|png|gif|webp|heic)$/i.test(name)) return "PHOTO";
  if (/plan/.test(lower)) return "PLAN";
  return "DOCUMENT";
}

type JobMapEntry = { btName: string; wciId: string | null; wciName?: string };

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const dir = args.dir;
  const mapPath = args["job-map"];
  if (!dir || !mapPath) {
    console.error("Usage: --dir <media-dir> --job-map <json>");
    process.exit(1);
  }
  const jobMap = JSON.parse(readFileSync(mapPath, "utf8")) as JobMapEntry[];
  const bySlug = new Map<string, JobMapEntry>();
  for (const j of jobMap) {
    const slug = (j.btName || j.wciName || "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 80);
    bySlug.set(slug, j);
  }

  const org = await prisma.organization.findFirst({ select: { id: true } });
  if (!org) throw new Error("no org");
  const admin = await prisma.user.findFirst({ where: { role: "ADMIN" }, select: { id: true } });

  const folders = readdirSync(dir, { withFileTypes: true }).filter((d) => d.isDirectory());
  let ok = 0;
  let skip = 0;
  let err = 0;

  for (const folder of folders) {
    const entry = bySlug.get(folder.name);
    if (!entry?.wciId) {
      console.log(`SKIP ${folder.name}: no wci job map`);
      skip++;
      continue;
    }
    const jobDir = join(dir, folder.name);
    const files = readdirSync(jobDir).filter((f) => !f.startsWith(".") && f !== "manifest.json" && f !== "screen.png");
    for (const fileName of files) {
      const full = join(jobDir, fileName);
      if (!existsSync(full) || !statSync(full).isFile()) continue;
      const size = statSync(full).size;
      if (size > 35 * 1024 * 1024) {
        console.log(`SKIP ${folder.name}/${fileName}: ${size} bytes too large for single upload`);
        skip++;
        continue;
      }
      // Idempotent-ish: skip if same fileName already on job
      const existing = await prisma.file.findFirst({
        where: { jobId: entry.wciId, fileName },
        select: { id: true },
      });
      if (existing) {
        console.log(`exists ${folder.name}/${fileName}`);
        skip++;
        continue;
      }
      try {
        const bytes = readFileSync(full);
        const category = categoryFor(fileName);
        const file = await uploadAndRegisterFile({
          organizationId: org.id,
          jobId: entry.wciId,
          uploadedByUserId: admin?.id ?? null,
          fileName,
          bytes,
          mimeType: mimeFor(fileName),
          sizeBytes: bytes.byteLength,
          category,
          clientVisible: true,
          subVisible: true,
        });
        console.log(`ok ${folder.name}/${fileName} → ${file.id} (${category})`);
        ok++;
      } catch (e) {
        console.error(`ERR ${folder.name}/${fileName}:`, e instanceof Error ? e.message : e);
        err++;
      }
    }
  }
  console.log(`Done. ok=${ok} skip=${skip} err=${err}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
