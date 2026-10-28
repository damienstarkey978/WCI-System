-- WCI never uses Net 30. New invoices default to CUSTOM (no implied due-date math).
ALTER TABLE "Invoice" ALTER COLUMN "paymentTerms" SET DEFAULT 'CUSTOM';
