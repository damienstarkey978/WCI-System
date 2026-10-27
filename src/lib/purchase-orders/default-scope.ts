/**
 * Default Scope of Work pasted into new POs — mirrors the Subcontractor
 * Responsibilities clause WCI uses in Buildertrend. Copied into
 * PurchaseOrder.scopeOfWork at create time (not referenced), so later edits
 * to this constant never rewrite an agreement a vendor already accepted.
 */
export const DEFAULT_PO_SCOPE_OF_WORK = `***Subcontractor Responsibilities and Compliance Clause

As a subcontractor to World Construction Incorporated ("Contractor"), you agree to the following terms and conditions as part of this agreement:

1. Work Schedule and Coordination
• Standard work hours are 8:00 a.m. to 5:00 p.m. unless otherwise approved in writing by the Contractor.
• Subcontractor shall coordinate all work with the Contractor's schedule and other trades on site.
• Arrive prepared to start on the scheduled completion date shown on this purchase order.

2. Job-Site Cleanliness
• Keep the work area clean and free of debris daily.
• Remove all scrap, packaging, and leftover materials when the work is complete.

3. Safety and PPE
• Comply with all OSHA and Contractor safety requirements.
• Wear required personal protective equipment at all times on site.

4. Workmanship
• Perform all work in a professional manner consistent with industry standards and the plans/specs for this job.
• Correct defective work promptly at no additional cost to the Contractor.

5. Compliance
• Repeated violations may lead to disqualification from future projects with the Contractor.
`;

/** First default agreement template name when seeding or picking a template. */
export const DEFAULT_PO_AGREEMENT_TEMPLATE_NAME = "WCI Subcontractor Responsibilities";
