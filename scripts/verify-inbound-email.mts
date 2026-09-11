/**
 * Proves inbound bill email end to end against the real database: address routing
 * (including the org-slug/job-prefix ambiguity), what happens to mail that matches
 * nothing, duplicate delivery, and that nothing arrives already approved.
 *
 * The OCR call itself is the existing drag-and-drop path and is not re-tested here;
 * these cases run without ANTHROPIC_API_KEY, which is why attachments are either
 * absent or deliberately unreadable.
 */
import { ingestInboundEmail, routeInboundAddress } from "../src/lib/bills/inbound-email";
import { db } from "../src/lib/db";

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error("FAILED: " + msg);
  console.log("OK: " + msg);
}

async function main() {
  const stamp = Date.now();
  const org = await db.organization.create({
    data: { name: `Inbound Co ${stamp}`, slug: `inbound-co-${stamp}` },
  });
  const job = await db.job.create({
    data: { organizationId: org.id, name: "283 River Curve", prefix: `283RC${stamp}`, contractType: "FIXED_PRICE", status: "OPEN" },
  });
  const other = await db.job.create({
    data: { organizationId: org.id, name: "Newer job", contractType: "FIXED_PRICE", status: "OPEN" },
  });

  const domain = "inbox.worldconstructionjax.com";

  // ---- Routing -------------------------------------------------------------
  const orgLevel = await routeInboundAddress(`bills-${org.slug}@${domain}`);
  assert(orgLevel.organizationId === org.id && orgLevel.jobId === null, "an org address resolves to the org, no job");

  const jobLevel = await routeInboundAddress(`bills-${org.slug}-${job.prefix}@${domain}`);
  assert(
    jobLevel.organizationId === org.id && jobLevel.jobId === job.id,
    "a job address resolves to both, despite hyphens on both sides of the split",
  );

  const jobLevelCased = await routeInboundAddress(`BILLS-${org.slug.toUpperCase()}-${job.prefix!.toLowerCase()}@${domain}`);
  assert(jobLevelCased.jobId === job.id, "and does so regardless of how the sender's client cased it");

  const badJob = await routeInboundAddress(`bills-${org.slug}-nosuchjob@${domain}`);
  assert(
    badJob.organizationId === org.id && badJob.jobId === null && badJob.note !== null,
    "a good org with a mistyped job prefix files against the org and says so",
  );

  const nobody = await routeInboundAddress(`bills-not-an-org-${stamp}@${domain}`);
  assert(nobody.organizationId === null, "an unknown address routes nowhere");

  const notOurs = await routeInboundAddress("accounts@somevendor.com");
  assert(notOurs.organizationId === null, "and so does an address that isn't ours at all");

  // ---- Unroutable mail is kept, not dropped --------------------------------
  const stray = await ingestInboundEmail({
    to: `bills-typo-${stamp}@${domain}`,
    from: "ap@homedepot.com",
    subject: "Invoice 8842",
    text: "Attached.",
    messageId: `<stray-${stamp}@homedepot.com>`,
    attachments: [],
  });
  assert(stray.status === "UNROUTED", "mail matching no organization is recorded as unrouted");
  const strayRow = await db.inboundEmail.findUniqueOrThrow({ where: { id: stray.inboundEmailId } });
  assert(
    strayRow.fromAddress === "ap@homedepot.com" && strayRow.subject === "Invoice 8842",
    "with the sender and subject kept, so someone can go back to them",
  );
  assert(strayRow.note !== null, "and a note saying why it didn't route");

  // ---- Duplicate delivery --------------------------------------------------
  const again = await ingestInboundEmail({
    to: `bills-typo-${stamp}@${domain}`,
    from: "ap@homedepot.com",
    subject: "Invoice 8842",
    text: "Attached.",
    messageId: `<stray-${stamp}@homedepot.com>`,
    attachments: [],
  });
  assert(again.duplicate === true, "a retried delivery is recognised as the same email");
  assert(again.inboundEmailId === stray.inboundEmailId, "and doesn't create a second record");
  assert((await db.inboundEmail.count({ where: { messageId: `<stray-${stamp}@homedepot.com>` } })) === 1, "still one row");

  // ---- Routed mail ---------------------------------------------------------
  const routed = await ingestInboundEmail({
    to: `bills-${org.slug}-${job.prefix}@${domain}`,
    from: "billing@subcontractor.com",
    subject: "March invoice",
    text: "See attached.",
    messageId: `<routed-${stamp}@subcontractor.com>`,
    attachments: [],
  });
  assert(routed.status === "ROUTED", "mail to a valid job address routes");
  const routedRow = await db.inboundEmail.findUniqueOrThrow({ where: { id: routed.inboundEmailId } });
  assert(routedRow.jobId === job.id, "against the job the address named, not the most recent one");
  assert(
    routedRow.note?.includes("no attachments") === true,
    "and an email with nothing attached says so rather than looking like a success",
  );

  // ---- An org-level address with no job named falls back --------------------
  const orgOnly = await ingestInboundEmail({
    to: `bills-${org.slug}@${domain}`,
    from: "billing@subcontractor.com",
    subject: "Unattributed",
    text: null,
    messageId: `<orgonly-${stamp}@subcontractor.com>`,
    attachments: [],
  });
  const orgOnlyRow = await db.inboundEmail.findUniqueOrThrow({ where: { id: orgOnly.inboundEmailId } });
  assert(orgOnlyRow.jobId === other.id, "an org-level email falls back to the most recently touched open job");

  // ---- An unreadable attachment is reported, never guessed at ---------------
  const junk = await ingestInboundEmail({
    to: `bills-${org.slug}-${job.prefix}@${domain}`,
    from: "billing@subcontractor.com",
    subject: "Zip of invoices",
    text: null,
    messageId: `<junk-${stamp}@subcontractor.com>`,
    attachments: [{ fileName: "invoices.zip", contentType: "application/zip", bytes: Buffer.from("PK") }],
  });
  assert(junk.billsCreated === 0, "a file type the OCR can't read produces no bill");
  assert(junk.note?.includes("invoices.zip") === true, "and names the file that was skipped");

  // Nothing here creates a bill — every attachment above is deliberately unreadable
  // without an API key. That an emailed bill lands in INBOX and goes no further is
  // asserted in src/lib/bills/inbound-email.test.ts, where the OCR call is mocked;
  // claiming it here off an empty result set would be a test that always passes.
  assert(
    (await db.bill.count({ where: { inboundEmail: { organizationId: org.id } } })) === 0,
    "no bill was created from an unreadable attachment",
  );

  await db.bill.deleteMany({ where: { jobId: { in: [job.id, other.id] } } });
  await db.inboundEmail.deleteMany({ where: { OR: [{ organizationId: org.id }, { messageId: { contains: String(stamp) } }] } });
  await db.job.deleteMany({ where: { organizationId: org.id } });
  await db.organization.delete({ where: { id: org.id } });

  console.log("\nInbound bill email verified end to end.");
  await db.$disconnect();
}

main().catch(async (error) => {
  console.error(error);
  await db.$disconnect();
  process.exit(1);
});
