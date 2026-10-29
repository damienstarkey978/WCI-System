-- WCI never uses Net 30. Align the Invoice.paymentTerms default with CUSTOM
-- (no implied due-date math) so new invoices match Buildertrend blank terms.
ALTER TABLE "Invoice" ALTER COLUMN "paymentTerms" SET DEFAULT 'CUSTOM';
