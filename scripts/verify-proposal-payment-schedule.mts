/**
 * Real end-to-end check, against the local database: a proposal's payment schedule
 * survives from being typed in the editor through to a real Job's DrawSchedule after
 * the client accepts — which is the entire point of the feature. No mocks; every
 * call here is the real service function a page's Server Action calls.
 */
import { db } from "@/lib/db";
import { createLead } from "@/lib/crm/service";
import { createLeadProposal } from "@/lib/crm/lead-proposal";
import {
  ProposalDrawOverallocatedError,
  ProposalNotEditableError,
  acceptProposal,
  addProposalDraw,
  deleteProposalDraw,
  sendProposal,
} from "@/lib/proposals/service";

let failures = 0;
function check(label: string, passed: boolean, detail = "") {
  console.log(`${passed ? "  ok  " : "FAIL  "} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!passed) failures += 1;
}

const org = await db.organization.findFirst({ select: { id: true } });
const costCode = await db.costCode.findFirst({ where: { organizationId: org?.id, isActive: true }, select: { id: true } });
if (!org || !costCode) throw new Error("Seed an organization and cost codes first.");

const lead = await createLead({
  organizationId: org.id,
  name: "Payment Schedule Test",
  email: `pay-schedule-test-${Date.now()}@example.com`,
});

const proposal = await createLeadProposal({
  organizationId: org.id,
  leadId: lead.id,
  title: "Payment Schedule Verification",
  lineItems: [{ costCodeId: costCode.id, title: "Test line", unitCostCents: 100_000 }],
});

// --- Build the schedule, exactly as the editor form would ---------------------

const deposit = await addProposalDraw(org.id, proposal.id, { title: "Deposit", pctOfContractBasisPoints: 1_000 });
await addProposalDraw(org.id, proposal.id, { title: "Rough-in complete", pctOfContractBasisPoints: 4_000 });
await addProposalDraw(org.id, proposal.id, { title: "Final", pctOfContractBasisPoints: 5_000 });

const beforeAccept = await db.proposalDraw.findMany({ where: { proposalId: proposal.id }, orderBy: { sortOrder: "asc" } });
check("three milestones recorded, in order", beforeAccept.map((d) => d.title).join(",") === "Deposit,Rough-in complete,Final");
check("percentages total exactly 100%", beforeAccept.reduce((sum, d) => sum + d.pctOfContractBasisPoints, 0) === 10_000);

await addProposalDraw(org.id, proposal.id, { title: "Would overallocate", pctOfContractBasisPoints: 100 }).then(
  () => check("a schedule over 100% is refused", false, "it was allowed"),
  (error) => check("a schedule over 100% is refused", error instanceof ProposalDrawOverallocatedError, String(error)),
);

await deleteProposalDraw(org.id, deposit.id);
const afterDelete = await db.proposalDraw.findMany({ where: { proposalId: proposal.id } });
check("removing a milestone actually removes it", afterDelete.length === 2);
// Put it back so the accepted schedule below is the full, intended one.
await addProposalDraw(org.id, proposal.id, { title: "Deposit", pctOfContractBasisPoints: 1_000 });

// --- Accept, and confirm a real DrawSchedule appears on the new Job -----------

await sendProposal(org.id, proposal.id);
const accepted = await acceptProposal({ organizationId: org.id, proposalId: proposal.id });
check("acceptance opens a real Job", typeof accepted.jobId === "string" && accepted.jobId.length > 0);

const drawSchedules = await db.drawSchedule.findMany({
  where: { jobId: accepted.jobId },
  include: { draws: { orderBy: { sortOrder: "asc" } } },
});
check("exactly one DrawSchedule was created on the Job", drawSchedules.length === 1);
const jobDraws = drawSchedules[0]?.draws ?? [];
check(
  "its milestones match the proposal's, in the same order",
  jobDraws.map((d) => `${d.title}:${d.pctOfContractBasisPoints}`).join(",") ===
    "Rough-in complete:4000,Final:5000,Deposit:1000",
);
check(
  "a job draw has no auto-invoice date yet — the office sets real dates, this only carries the percentages",
  jobDraws.every((d) => d.autoGeneratesInvoiceOnDate === null),
);

// The proposal's own rows are untouched by acceptance — they're the offer, not the
// thing that bills; a job's real schedule is now the copy.
const proposalDrawsAfter = await db.proposalDraw.findMany({ where: { proposalId: proposal.id } });
check("the proposal's own draws are unaffected by acceptance", proposalDrawsAfter.length === 3);

// --- An accepted proposal's schedule can no longer be edited -------------------

await addProposalDraw(org.id, proposal.id, { title: "Too late", pctOfContractBasisPoints: 100 }).then(
  () => check("an accepted proposal's schedule can't be edited", false, "it was allowed"),
  (error) => check("an accepted proposal's schedule can't be edited", error instanceof ProposalNotEditableError, String(error)),
);

// --- A proposal with no schedule at all still accepts normally -----------------

const noScheduleLead = await createLead({
  organizationId: org.id,
  name: "No Schedule Test",
  email: `no-schedule-test-${Date.now()}@example.com`,
});
const noScheduleProposal = await createLeadProposal({
  organizationId: org.id,
  leadId: noScheduleLead.id,
  title: "No Schedule Verification",
  lineItems: [{ costCodeId: costCode.id, title: "Test line", unitCostCents: 50_000 }],
});
await sendProposal(org.id, noScheduleProposal.id);
const acceptedNoSchedule = await acceptProposal({ organizationId: org.id, proposalId: noScheduleProposal.id });
const noScheduleDrawSchedules = await db.drawSchedule.findMany({ where: { jobId: acceptedNoSchedule.jobId } });
check(
  "a proposal with no payment schedule creates no DrawSchedule (nothing forced on the office)",
  noScheduleDrawSchedules.length === 0,
);

console.log(failures === 0 ? "\nProposal payment schedule works end to end." : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
