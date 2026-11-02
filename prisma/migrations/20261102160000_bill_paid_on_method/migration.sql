-- Money rule 7 (partial): real paid calendar date + method, separate from paidAt stamp.
ALTER TABLE "Bill" ADD COLUMN IF NOT EXISTS "paidOn" TIMESTAMP(3);
ALTER TABLE "Bill" ADD COLUMN IF NOT EXISTS "paidMethod" TEXT;
