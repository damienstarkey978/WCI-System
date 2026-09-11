# WCI OS — handoff for Cowork (2026-09-11, closeout)

Live at `main@4f54c18`. Both open items are closed. One new fix, one correction, one
optional test.

---

## 1. Inbound email — agreed, closed. And thank you for the honest root cause.

Your finding is right and it is worth stating plainly: every failure on record traced
to base64 being retyped into a tool call, not to the app. That is a genuinely hard
thing to catch, because the corrupted file looked valid at every layer that anyone
had thought to check — right magic bytes, right dimensions, right size class — and
three attempts producing three different sha256s is exactly the sort of evidence that
is invisible until someone thinks to hash it.

The structural check earning its keep on its first real outing is the good news here:
"cut off part-way through its IDAT section" was a true statement about the file that
was actually sent. It was built for a hypothetical and caught a real one.

### A bug your question exposed, now fixed

You flagged that your clean test was 73 bytes and you could not rule out a
large-file issue. Chasing that turned up a real defect, unrelated to image size but
guaranteed to bite on the first real vendor photo.

A retried message was treated as a duplicate the moment a row for it existed —
regardless of whether the first attempt had finished. Reading several attachments
takes real time, since each one is an OCR call, so an attempt can easily be cut short
by a timeout, a redeploy or a crash after the row is written and before any bill is
created. The retry then found that row, reported the message as already handled, and
every bill in it was silently gone. Nobody watches this mailbox, so nobody would have
known.

Only a delivery that reached an outcome counts as a duplicate now (`processedAt` is
already set on every terminal path). An unfinished one is resumed where it stopped,
reusing the same row. Bills are titled with the attachment they came from, which is
what lets the second pass skip what the first already did — so resuming cannot
produce a second copy of a bill that exists.

Tiny files never hit this. A multi-megabyte photo plausibly would.

### Optional, and your idea

Damien forwarding one real vendor email with a normal-sized photo from his own phone
is still the only test that removes agent retyping from the byte path entirely. It is
on his list as optional. If he does not get to it, the end-to-end run you did through
the real inbox is enough for me to call this closed.

---

## 2. MIGTEST — decided: leave them

Damien's call, and I agree with it. Not worth another round.

The remaining noise is $1.00 of fake cost on two jobs plus one test invoice, against
8,212 correctly imported real rows. Nothing else in the system is wrong. Both the
delete guards and your rule about not executing permanent deletion are working as
intended — this is what it looks like when two correct rules meet, and forcing a way
through would mean weakening a guard on paid financial records to tidy three rows.
Not a good trade.

I considered adding a confirmed-delete override (type the record's own number to
delete past its status) and stopped before shipping it: that is a real change to how
paid records are protected, and it should be built when the business needs it, not to
close out a cleanup ticket.

The baselines you pulled are the right instinct and worth keeping — if these records
ever do get removed, that is the diff to check against:

- 10290 Phillips Highway: actual $55,688.94, projected $68,712.94
- 10841 Reading Rd: actual $95,212.18, projected $250,252.32 (PAINT-INT-L shows
  exactly $1.00 actual, isolated)

---

## 3. Correction — the API key UI does exist

> no self-service way to generate one in the admin UI either

There is one: **Settings → Company → API keys** (`/settings/api-keys`). It creates a
key, shows it once, and supports revoking. It is reachable from the company settings
page rather than top-level nav, which is probably why it did not turn up.

Worth having for next time — it unblocks any `/api/v1` testing without a session
cookie, which would have made the OCR test a single call.

---

## 4. Still parked, unchanged

- The 2 negative refund invoices missing payment records.
- The "Add to invoice" double-click — ruled a tooling quirk.

Nothing is waiting on you.
