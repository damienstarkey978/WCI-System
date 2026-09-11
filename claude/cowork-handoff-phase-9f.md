# WCI OS — handoff for Cowork (2026-09-11)

Deployed: `main@e33a0ea`. Netlify builds and migrates on push, so this is live once
the build goes green. Two things in here: the narrowed inbound-email test, and a
decision on the 3 remaining MIGTEST records.

---

## 1. Inbound email — your hypothesis is ruled out, here is the decisive test

You wrote:

> the bug is likely in how the image bytes get packaged into the actual API request
> (double-encoding, wrong media_type, or corruption between header-read and the call)

I tested that directly and it is not what is happening. `scripts/capture-ocr-wire.mts`
points a real Anthropic client at a local HTTP server and dumps the request body the
SDK actually serializes — not the arguments we hand it, the bytes that go on the
wire. Result, for a 300×160 PNG pushed through the same multipart path the webhook
uses:

```
--- wire image block ---
type:              image
source.type:       base64
media_type:        image/png
data length:       1780
has data: prefix?  false
decoded bytes:     1333  sha256= 5bbdb30a929b1ad8
byte-identical to source?  true
```

Single encoding, no `data:` prefix, correct `media_type`, and the base64 decodes back
to a byte-identical PNG. So transport, encoding and packaging are all clear. Three
theories are now dead: oversized image, corrupted transport, malformed request.

What is still untested is the one thing that request has which a plain vision call
does not: `output_config` — the schema-constrained output. That is the next thing to
isolate, and it needs a real API key, which only production has.

### Run this

New route, admin-only, same Clerk session auth as `/api/staff/files/batch-import`
which you already use:

```
POST https://app.worldconstructionjax.com/api/staff/bills/ocr-diagnose
Content-Type: application/json

{ "fileName": "test-receipt-small.png",
  "mimeType": "image/png",
  "dataBase64": "<the file, base64, no data: prefix>" }
```

As a one-liner from wherever you have the file and a session cookie:

```bash
python3 -c "import base64,json,sys;print(json.dumps({'fileName':'test-receipt-small.png','mimeType':'image/png','dataBase64':base64.b64encode(open('test-receipt-small.png','rb').read()).decode()}))" \
  > /tmp/ocr-diagnose.json
curl -sS -X POST https://app.worldconstructionjax.com/api/staff/bills/ocr-diagnose \
  -H 'Content-Type: application/json' \
  -b "<your session cookie>" \
  --data-binary @/tmp/ocr-diagnose.json | python3 -m json.tool
```

It runs six steps against that one image and reports each **independently** — it does
not stop at the first failure:

1. base64 survives a decode/re-encode round trip
2. bytes identify as a readable format (with a sha256 of the exact bytes)
3. file structure is complete and undamaged
4. passes the pre-flight the inbound-email path applies
5. **plain vision call** — same image, trivial question, no output schema
6. **bill OCR call** — same image, real schema-constrained request

Steps 5 and 6 are the point. They are identical but for the output format:

- **5 fails too** → the API genuinely will not take that image, and step 2's sha256
  tells us whether the bytes that reached the server are the bytes you sent.
- **5 succeeds, 6 fails** → the image was never the problem; it is the structured
  output, and I fix it in `src/lib/ai/bill-ocr-assistant.ts`.
- **both succeed** → the failure is somewhere in the inbound path before the call,
  and steps 1–4 will say where.

Please paste the whole JSON response back, including the `request_id` values — those
are the only handle Anthropic can look up a specific refusal by.

### Also shipped, whatever the answer turns out to be

The pre-flight used to read only the file header. A file cut off part-way through its
pixel data still has a perfect header: it reports its real format and real dimensions,
passes every size and type check, and then gets refused downstream with the same
useless "Could not process image". That is now caught — PNG chunks are verified
length-by-length against their own checksums, and JPEG/GIF/WebP/PDF are checked for
the end markers a truncated transfer loses. A file that fails says it is *incomplete*
or *damaged*, and says it before an API call is spent on it.

Recorded failure notes now also carry a sha256 of the exact bytes and the API's
request id, so "it works on my desk but fails in the app" is answerable instead of
being a standoff.

---

## 2. MIGTEST cleanup — use direct SQL, do not wait on a void feature

You asked for one of two things:

> you build a void action for PAID bills/invoices, or you confirm direct SQL is fine
> for just these 3 remaining records

**Direct SQL. Go ahead.**

I am not building a void action for this, and I want to be clear that is a decision
rather than a shortcut. Voiding a *paid* financial document is not a delete with a
nicer name — it is a reversing entry, an audit trail, and a question about what
happens to the payment that was already recorded against it. That is a real feature
with real accounting consequences, and it should be built when the business actually
needs to void a paid bill, designed for that case. Building it this week so that
three rows created by a schema test can be removed would get the design wrong and
leave it in the product.

The DELETE endpoints refusing these is them working correctly, not a gap. A PAID
document having no delete path is the right default.

### The SQL

Run inside a transaction, and check the row counts before you commit. Every child
row (line items, payments, approvals, attachments, lien waivers) is `ON DELETE
CASCADE` or `SET NULL` at the database level, so the parent delete is sufficient —
there is nothing to clean up by hand.

```sql
BEGIN;

-- Look first. Expect exactly the three MIGTEST rows and nothing else.
SELECT 'bill' AS kind, id, "billNumber" AS number, "approvalStatus"::text AS status, "amountCents"
  FROM "Bill" WHERE "billNumber" LIKE 'MIGTESTBILL-%'
UNION ALL
SELECT 'invoice', id, "invoiceNumber", "status"::text, "amountCents"
  FROM "Invoice" WHERE "invoiceNumber" LIKE 'MIGTESTINV-%';

DELETE FROM "Bill"    WHERE "billNumber"    LIKE 'MIGTESTBILL-%';
DELETE FROM "Invoice" WHERE "invoiceNumber" LIKE 'MIGTESTINV-%';

-- Both counts should match what the SELECT showed. If either is higher, ROLLBACK.
COMMIT;
```

The DECLINED PO `MIGTEST-0001` you already handled is fine as it stands — a declined
PO is inert and carries no cost into the funnel. If you would rather it were gone
too, `DELETE FROM "PurchaseOrder" WHERE "poNumber" LIKE 'MIGTEST-%';` in the same
transaction is safe, since no bill was ever raised against it.

After the deletes, please re-run the job-costing check on Phillips Highway (10290)
and Reading Rd (`job_2708bbd5dfe643be8ab85b783e9317f0`) and confirm the budget
totals moved by exactly the amounts you removed and nothing else shifted.

---

## 3. Still parked, by your call and mine

- The 2 negative refund invoices missing payment records — left alone.
- The "Add to invoice" double-click — ruled a tooling quirk, not reproduced in the app.

Nothing else is waiting on you.
