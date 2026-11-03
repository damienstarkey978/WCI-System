-- Buildertrend Create Bill: "Mark as Billable to Client" checkbox.
ALTER TABLE "Bill" ADD COLUMN "billableToClient" BOOLEAN NOT NULL DEFAULT false;
