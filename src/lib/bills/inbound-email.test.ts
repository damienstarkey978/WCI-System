import { describe, expect, it, vi } from "vitest";

import { billsLocalPartsFrom } from "@/lib/bills/inbound-email";

describe("pulling our address out of the To field", () => {
  it("reads a bare address", () => {
    expect(billsLocalPartsFrom("bills-world-construction@inbox.worldconstructionjax.com")).toEqual([
      "world-construction",
    ]);
  });

  it("reads a display-name address, which is how most clients send", () => {
    expect(billsLocalPartsFrom('"WCI Accounts" <bills-world-construction@inbox.worldconstructionjax.com>')).toEqual([
      "world-construction",
    ]);
  });

  it("finds ours among several recipients", () => {
    // Forwarding to the office and to us at once is normal, and the other
    // recipients must not confuse the routing.
    const to = "office@worldconstructioninc.com, bills-world-construction-283rc@inbox.worldconstructionjax.com";
    expect(billsLocalPartsFrom(to)).toEqual(["world-construction-283rc"]);
  });

  it("is case-insensitive, since mail clients rewrite case freely", () => {
    expect(billsLocalPartsFrom("Bills-World-Construction@Inbox.WorldConstructionJax.com")).toEqual([
      "world-construction",
    ]);
  });

  it("returns nothing for an address that isn't one of ours", () => {
    expect(billsLocalPartsFrom("accounts@somevendor.com")).toEqual([]);
  });

  it("ignores an address that merely contains 'bills-' later on", () => {
    expect(billsLocalPartsFrom("ap-bills-team@somevendor.com")).toEqual([]);
  });

  it("returns every candidate when a message was sent to two of our addresses", () => {
    const to = "bills-org-a@inbox.example.com, bills-org-b@inbox.example.com";
    expect(billsLocalPartsFrom(to)).toEqual(["org-a", "org-b"]);
  });
});

// --- What an emailed bill looks like once created --------------------------
// The OCR call itself is the drag-and-drop path and is tested there; what matters
// here is what this module does with its result. Mocking it is the only way to
// assert that without an API key and a real receipt image.
vi.mock("@/lib/ai/bill-ocr-service", () => ({
  createBillFromOcr: vi.fn(async () => ({ bill: { id: "bill_1", vendorName: "The Home Depot" }, assumptions: [] })),
  JobNotFoundError: class extends Error {},
  NoCostCodesError: class extends Error {},
}));

const updated: { where: unknown; data: Record<string, unknown> }[] = [];

vi.mock("@/lib/db", () => ({
  db: {
    inboundEmail: {
      findUnique: vi.fn(async () => null),
      create: vi.fn(async () => ({ id: "email_1" })),
      update: vi.fn(async () => ({ id: "email_1" })),
    },
    organization: { findUnique: vi.fn(async () => ({ id: "org_1" })) },
    job: { findFirst: vi.fn(async () => ({ id: "job_1" })) },
    bill: {
      update: vi.fn(async (args: { where: unknown; data: Record<string, unknown> }) => {
        updated.push(args);
        return {};
      }),
    },
  },
}));

describe("a bill created from an email", () => {
  it("lands in INBOX, attributed to the email, and never further along", async () => {
    const { ingestInboundEmail } = await import("@/lib/bills/inbound-email");

    const result = await ingestInboundEmail({
      to: "bills-org-a@inbox.example.com",
      from: "ap@homedepot.com",
      subject: "Invoice 8842",
      text: null,
      messageId: "<m1@homedepot.com>",
      attachments: [
        {
          fileName: "receipt.pdf",
          contentType: "application/pdf",
          // A complete-enough PDF: the pre-flight now rejects files that stop
          // before their end marker, which is what a half-delivered upload is.
          bytes: Buffer.from("%PDF-1.7\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n"),
        },
      ],
    });

    expect(result.billsCreated).toBe(1);
    expect(updated).toHaveLength(1);

    const data = updated[0].data;
    // The whole point: an emailed bill arrived unattended, so nobody has confirmed
    // it is a bill, for this job, for this amount. INBOX is excluded from actual
    // cost in the funnel precisely so unread mail can't move a job's numbers.
    expect(data.approvalStatus).toBe("INBOX");
    expect(data.source).toBe("EMAIL");
    expect(data.inboundEmailId).toBe("email_1");
    expect(data.sourceEmailFrom).toBe("ap@homedepot.com");
    expect(data.sourceEmailSubject).toBe("Invoice 8842");
    expect(data.sourceEmailMessageId).toBe("<m1@homedepot.com>");
  });
});

// --- Retries of a message that was already delivered once -------------------
// SendGrid retries anything that isn't a 2xx, and reading several attachments can
// outlive the request that started it. What separates a genuine duplicate from a
// half-finished first attempt is processedAt, and getting that wrong loses mail.

const pdf = () => ({
  fileName: "receipt.pdf",
  contentType: "application/pdf",
  bytes: Buffer.from("%PDF-1.7\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n"),
});

describe("a message that arrives twice", () => {
  it("is a duplicate only once the first delivery reached an outcome", async () => {
    const { db } = await import("@/lib/db");
    const { ingestInboundEmail } = await import("@/lib/bills/inbound-email");
    const { createBillFromOcr } = await import("@/lib/ai/bill-ocr-service");

    vi.mocked(db.inboundEmail.findUnique).mockResolvedValueOnce({
      id: "email_1",
      status: "ROUTED",
      note: null,
      processedAt: new Date(),
      bills: [{ title: "receipt.pdf" }],
      _count: { bills: 1 },
    } as never);
    vi.mocked(createBillFromOcr).mockClear();

    const result = await ingestInboundEmail({
      to: "bills-org-a@inbox.example.com",
      from: "ap@homedepot.com",
      subject: "Invoice 8842",
      text: null,
      messageId: "<m1@homedepot.com>",
      attachments: [pdf()],
    });

    expect(result.duplicate).toBe(true);
    expect(result.billsCreated).toBe(1);
    expect(createBillFromOcr).not.toHaveBeenCalled();
  });

  it("resumes an attempt that died part-way instead of dropping its bills", async () => {
    const { db } = await import("@/lib/db");
    const { ingestInboundEmail } = await import("@/lib/bills/inbound-email");
    const { createBillFromOcr } = await import("@/lib/ai/bill-ocr-service");

    // The first pass read one of two attachments and never came back: the row is
    // here, processedAt is still null. Calling this a duplicate would file the
    // email as handled and lose the second bill entirely.
    vi.mocked(db.inboundEmail.findUnique).mockResolvedValueOnce({
      id: "email_1",
      status: "UNROUTED",
      note: null,
      processedAt: null,
      bills: [{ title: "first.pdf" }],
      _count: { bills: 1 },
    } as never);
    vi.mocked(createBillFromOcr).mockClear();
    vi.mocked(db.inboundEmail.create).mockClear();

    const result = await ingestInboundEmail({
      to: "bills-org-a@inbox.example.com",
      from: "ap@homedepot.com",
      subject: "Invoice 8842",
      text: null,
      messageId: "<m1@homedepot.com>",
      attachments: [{ ...pdf(), fileName: "first.pdf" }, { ...pdf(), fileName: "second.pdf" }],
    });

    expect(result.duplicate).toBe(false);
    // No second row for the same message, and the attachment already read is not
    // read again — one bill carried over, one newly created.
    expect(db.inboundEmail.create).not.toHaveBeenCalled();
    expect(createBillFromOcr).toHaveBeenCalledTimes(1);
    expect(result.billsCreated).toBe(2);
  });
});
