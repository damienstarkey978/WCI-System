/**
 * Repair OPEN-job schedules from BT export:
 * - Schedule.isOnline = !BT.calendarOffline
 * - Ensure Schedule row exists when BT has a calendarOffline flag
 * - Upsert items by BT ScheduleItemId (notesInternal `[BT ref: id]`) or (title.trim, start)
 * - Sync durationDays, percentComplete, clientVisible (ShowOwner), sortOrder
 * Never invent dates — only values from CSV / JSON offline flags.
 */
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../src/generated/prisma/client";
import fs from "fs";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

type BtItem = {
  title: string;
  start: string;
  duration: number;
  completed: boolean;
  showOwner: boolean;
  id: string;
};

function day(d: Date | null | undefined) {
  return d ? d.toISOString().slice(0, 10) : null;
}

async function main() {
  const bt = JSON.parse(
    fs.readFileSync("/tmp/bt-schedule-normalized.json", "utf8"),
  ) as {
    byJob: Record<string, BtItem[]>;
    offline: Record<string, boolean>;
  };

  const org = await prisma.organization.findFirst({
    where: { slug: "world-construction" },
  });
  if (!org) throw new Error("no org");
  const jobs = await prisma.job.findMany({
    where: { organizationId: org.id, status: "OPEN" },
    orderBy: { name: "asc" },
  });

  type RepairSummary = {
    name: string;
    actions: string[];
    btCount: number;
    wciCount?: number;
    created?: number;
    updated?: number;
    isOnline?: boolean;
    wantOnline?: boolean | null;
    actionCount?: number;
  };
  const summary: RepairSummary[] = [];

  for (const job of jobs) {
    const offlineKey = Object.keys(bt.offline).find(
      (k) => k.trim() === job.name.trim(),
    );
    const btOffline =
      offlineKey != null ? bt.offline[offlineKey] : null;
    const itemsKey = Object.keys(bt.byJob).find(
      (k) => k.trim() === job.name.trim(),
    );
    const btItems = itemsKey ? bt.byJob[itemsKey] : [];

    let sched = await prisma.schedule.findFirst({
      where: { jobId: job.id },
      include: { items: true },
    });

    const actions: string[] = [];

    // Create schedule if BT knows about this job's calendar (offline flag present)
    // OR we have items to import.
    if (!sched && (btOffline != null || btItems.length > 0)) {
      const wantOnline = btOffline == null ? true : !btOffline;
      sched = await prisma.schedule.create({
        data: {
          organizationId: org.id,
          jobId: job.id,
          name: "Schedule",
          isOnline: wantOnline,
          isDraft: false,
        },
        include: { items: true },
      });
      actions.push(`created schedule isOnline=${wantOnline}`);
    }

    if (sched && btOffline != null) {
      const wantOnline = !btOffline;
      if (sched.isOnline !== wantOnline) {
        await prisma.schedule.update({
          where: { id: sched.id },
          data: { isOnline: wantOnline },
        });
        actions.push(`isOnline ${sched.isOnline} → ${wantOnline}`);
        sched = { ...sched, isOnline: wantOnline };
      }
    }

    if (!sched) {
      summary.push({
        name: job.name,
        actions: ["no BT schedule signal — left empty"],
        btCount: 0,
        wciCount: 0,
      });
      continue;
    }

    // Reload items after possible create
    sched = await prisma.schedule.findFirstOrThrow({
      where: { id: sched.id },
      include: { items: true },
    });

    let created = 0;
    let updated = 0;
    let sort = 0;
    for (const b of btItems) {
      const startDate = new Date(`${b.start}T00:00:00.000Z`);
      const pct = b.completed ? 10_000 : 0;
      const refTag = `[BT ref: ${b.id}]`;
      const title = b.title.replace(/\s+$/, ""); // store trimmed; BT trailing space is noise

      const existing =
        sched.items.find((i) => i.notesInternal?.includes(refTag)) ||
        sched.items.find(
          (i) =>
            i.title.trim() === title &&
            day(i.manualStartDate) === b.start,
        ) ||
        // unique title+start among non-duplicates: if only one title match and starts equal or single occurrence
        (() => {
          const sameTitle = sched!.items.filter(
            (i) => i.title.trim() === title,
          );
          if (sameTitle.length === 1 && day(sameTitle[0].manualStartDate) === b.start)
            return sameTitle[0];
          return undefined;
        })();

      if (!existing) {
        const rec = await prisma.scheduleItem.create({
          data: {
            scheduleId: sched.id,
            title,
            durationDays: b.duration,
            manualStartDate: startDate,
            percentCompleteBasisPoints: pct,
            clientVisible: b.showOwner,
            subVisible: true,
            notesInternal: refTag,
            sortOrder: sort,
            confirmationStatus: "UNCONFIRMED",
          },
        });
        sched.items.push(rec);
        created++;
        actions.push(`+ ${title} @ ${b.start}`);
      } else {
        const patch: {
          title?: string;
          durationDays?: number;
          manualStartDate?: Date;
          percentCompleteBasisPoints?: number;
          clientVisible?: boolean;
          sortOrder?: number;
          notesInternal?: string;
        } = {};
        if (existing.title !== title) patch.title = title;
        if (existing.durationDays !== b.duration)
          patch.durationDays = b.duration;
        if (day(existing.manualStartDate) !== b.start)
          patch.manualStartDate = startDate;
        if (existing.percentCompleteBasisPoints !== pct)
          patch.percentCompleteBasisPoints = pct;
        if (existing.clientVisible !== b.showOwner)
          patch.clientVisible = b.showOwner;
        if (existing.sortOrder !== sort) patch.sortOrder = sort;
        if (!existing.notesInternal?.includes(refTag)) {
          patch.notesInternal = [existing.notesInternal, refTag]
            .filter(Boolean)
            .join("\n");
        }
        if (Object.keys(patch).length) {
          await prisma.scheduleItem.update({
            where: { id: existing.id },
            data: patch,
          });
          updated++;
          actions.push(`~ ${title} ${JSON.stringify(patch)}`);
        }
      }
      sort++;
    }

    summary.push({
      name: job.name,
      btCount: btItems.length,
      created,
      updated,
      isOnline: sched.isOnline,
      wantOnline: btOffline == null ? null : !btOffline,
      actions: actions.slice(0, 20),
      actionCount: actions.length,
    });
  }

  fs.writeFileSync(
    "/tmp/schedule-repair-summary.json",
    JSON.stringify(summary, null, 2),
  );
  console.log(
    JSON.stringify(
      {
        jobs: summary.length,
        onlineFixed: summary.filter((s) =>
          (s.actions || []).some((a: string) => a.startsWith("isOnline")),
        ).length,
        createdSchedules: summary.filter((s) =>
          (s.actions || []).some((a: string) => a.startsWith("created schedule")),
        ).length,
        itemsCreated: summary.reduce((a, s) => a + (s.created || 0), 0),
        itemsUpdated: summary.reduce((a, s) => a + (s.updated || 0), 0),
      },
      null,
      2,
    ),
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
