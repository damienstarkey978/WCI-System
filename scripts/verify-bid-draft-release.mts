/**
 * Proves the draft → release step on the bid board: a package being assembled is not
 * something a subcontractor can be invited to, and it can't go out with no scope.
 */
import {
  addBidPackageLineItems,
  createBidPackage,
  inviteVendorToBid,
  releaseBidPackage,
} from "../src/lib/bids/service";
import { db } from "../src/lib/db";

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error("FAILED: " + msg);
  console.log("OK: " + msg);
}

async function refuses(work: () => Promise<unknown>, msg: string) {
  try {
    await work();
  } catch {
    console.log("OK: " + msg);
    return;
  }
  throw new Error("FAILED: " + msg);
}

async function main() {
  const org = await db.organization.findFirstOrThrow();
  const stamp = Date.now();
  const job = await db.job.create({
    data: { organizationId: org.id, name: `Bid draft ${stamp}`, contractType: "FIXED_PRICE", status: "OPEN" },
  });
  const vendor = await db.vendor.create({
    data: { organizationId: org.id, name: `Drywall Co ${stamp}`, email: `drywall-${stamp}@example.com` },
  });

  // Saved as a draft: still being put together.
  const draft = await createBidPackage({
    organizationId: org.id,
    jobId: job.id,
    title: "Drywall",
    status: "DRAFT",
  });
  assert(draft.status === "DRAFT", "a package saved as a draft starts as a draft");

  await refuses(
    () => inviteVendorToBid(org.id, draft.id, vendor.id),
    "a sub can't be invited to a package that hasn't been released",
  );
  await refuses(
    () => releaseBidPackage(org.id, draft.id),
    "and an empty package can't be released — there'd be nothing to price",
  );

  await addBidPackageLineItems({
    organizationId: org.id,
    bidPackageId: draft.id,
    lineItems: [
      { title: "Hang and finish drywall, level 4", quantityMilli: 4_200_000, unit: "sq ft" },
      { title: "Patch existing ceiling", quantityMilli: 120_000, unit: "sq ft" },
    ],
  });

  const released = await releaseBidPackage(org.id, draft.id);
  assert(released.status === "OPEN", "with scope on it, the draft releases");

  const invited = await inviteVendorToBid(org.id, draft.id, vendor.id);
  assert(invited.status === "INVITED", "and now a sub can be invited");

  await refuses(
    () => releaseBidPackage(org.id, draft.id),
    "releasing twice is refused rather than silently repeating",
  );
  await refuses(
    () =>
      addBidPackageLineItems({
        organizationId: org.id,
        bidPackageId: draft.id,
        lineItems: [{ title: "Sneaky extra scope" }],
      }),
    "and scope can't be changed underneath a sub who is already pricing it",
  );

  // Releasing immediately stays possible — that's the other button.
  const straightOut = await createBidPackage({
    organizationId: org.id,
    jobId: job.id,
    title: "Painting",
    lineItems: [{ title: "Two coats throughout" }],
  });
  assert(straightOut.status === "OPEN", "a package created without asking for a draft still goes straight out");

  await db.bidSubmission.deleteMany({ where: { bidPackage: { jobId: job.id } } });
  await db.bidPackageLineItem.deleteMany({ where: { bidPackage: { jobId: job.id } } });
  await db.bidPackage.deleteMany({ where: { jobId: job.id } });
  await db.vendor.delete({ where: { id: vendor.id } });
  await db.job.delete({ where: { id: job.id } });

  console.log("\nBid package draft/release verified end to end.");
  await db.$disconnect();
}

main().catch(async (error) => {
  console.error(error);
  await db.$disconnect();
  process.exit(1);
});
