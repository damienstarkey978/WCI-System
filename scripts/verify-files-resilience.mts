/**
 * Proves the Files page survives a file row whose storage object cannot be signed.
 *
 * This is the bug behind "Minified React error #441" reported site-wide on every
 * job: the page signed every file inside one Promise.all, so a single unsignable
 * row rejected the lot and the whole page 500'd — hiding every *good* file on the
 * job. Orphan rows left behind by failed uploads are exactly that case.
 */
import { resolveFileUrl, resolveFileUrlSafe } from "../src/lib/files/service";
import { db } from "../src/lib/db";

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error("FAILED: " + msg);
  console.log("OK: " + msg);
}

async function main() {
  const org = await db.organization.findFirstOrThrow();
  const user = await db.user.findFirstOrThrow({ where: { organizationId: org.id } });
  const job = await db.job.create({
    data: { organizationId: org.id, name: `Files resilience ${Date.now()}`, contractType: "FIXED_PRICE", status: "OPEN" },
  });

  // One row the app can always resolve, and one pointing at a storage object that
  // isn't there — the shape an interrupted upload leaves behind.
  const good = await db.file.create({
    data: {
      organizationId: org.id,
      jobId: job.id,
      uploadedByUserId: user.id,
      fileName: "site-photo.jpg",
      category: "PHOTO",
      url: "https://example.com/site-photo.jpg",
    },
  });
  const orphan = await db.file.create({
    data: {
      organizationId: org.id,
      jobId: job.id,
      uploadedByUserId: user.id,
      fileName: "IMG_0074.jpeg",
      category: "PHOTO",
      url: `${org.id}/${job.id}/photo/does-not-exist-IMG_0074.jpeg`,
    },
  });

  // Locally this fails because Supabase storage isn't configured; in production it
  // fails because the object isn't in the bucket. Same code path, same blast radius —
  // which is the point.
  let strictThrew = false;
  try {
    await resolveFileUrl(orphan.url);
  } catch {
    strictThrew = true;
  }
  assert(strictThrew, "the strict resolver still throws on an unsignable file");

  assert((await resolveFileUrlSafe(orphan.url)) === null, "the safe resolver returns null instead");

  // The page's own shape: resolve the whole list at once.
  const files = await db.file.findMany({ where: { jobId: job.id }, orderBy: { fileName: "asc" } });
  const resolved = await Promise.all(
    files.map(async (file) => ({ id: file.id, url: await resolveFileUrlSafe(file.url) })),
  );

  assert(resolved.length === 2, "resolving the list no longer rejects — the page renders");
  assert(
    resolved.find((file) => file.id === good.id)!.url === "https://example.com/site-photo.jpg",
    "and the good file on the same job is still shown, which is what used to be lost",
  );
  assert(resolved.find((file) => file.id === orphan.id)!.url === null, "while the broken one renders as unavailable");

  await db.file.deleteMany({ where: { jobId: job.id } });
  await db.job.delete({ where: { id: job.id } });

  console.log("\nFiles page resilience verified: one bad row no longer takes the page down.");
  await db.$disconnect();
}

main().catch(async (error) => {
  console.error(error);
  await db.$disconnect();
  process.exit(1);
});
