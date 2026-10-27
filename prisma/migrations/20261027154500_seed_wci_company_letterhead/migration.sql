-- Backfill World Construction Inc letterhead + default proposal terms on existing orgs.
-- Wording matches Damien 2026-10-27 confirmation + prisma/data/wci-proposal-terms.md.

UPDATE "Organization"
SET
  "addressLine1" = COALESCE(NULLIF(TRIM("addressLine1"), ''), '6005 Powers Ave. #210'),
  "city" = COALESCE(NULLIF(TRIM("city"), ''), 'Jacksonville'),
  "state" = COALESCE(NULLIF(TRIM("state"), ''), 'FL'),
  "postalCode" = COALESCE(NULLIF(TRIM("postalCode"), ''), '32217'),
  "contactPhone" = COALESCE(NULLIF(TRIM("contactPhone"), ''), '904-717-1729'),
  "contactEmail" = COALESCE(NULLIF(TRIM("contactEmail"), ''), 'office@worldconstructioninc.com'),
  "slogan" = COALESCE(NULLIF(TRIM("slogan"), ''), 'Leaders in quality construction since 1994.')
WHERE "slug" = 'world-construction'
   OR "name" ILIKE 'World Construction%';

-- Only stamp defaultProposalTerms when empty so staff edits in Settings are preserved.
UPDATE "Organization"
SET "defaultProposalTerms" = $terms$## Terms & Conditions

### CHANGE ORDERS/CONCEALED CONDITIONS
If concealed conditions are discovered after work has begun which require a change in the estimated cost of the project, the contractor may stop work until parties execute a Change Order. The cost of the additional work will be agreed upon and added to the outstanding balance.

### ESTIMATED DATE OF COMMENCEMENT
Within 14 days of approved permit.

### ESTIMATED DATE OF COMPLETION
Within 120 days of commencement. (Weather and unforeseen conditions or changes to scope may impact the estimated completion timeframe)

### Cancelation
Contract may be cancelled within 3 days of execution without penalty. Cancellation of this agreement after 3 days will incur a fee equal to the deposit of the contract.

By signing this proposal World Construction Inc. may obtain any necessary permits and file a Notice of commencement for the project.

## FINANCIAL TERMS

15% of contract total due upon execution of this agreement.

20% due upon commencement of work.

20% due upon completion of demo, concrete/ foundation, framing, roof and wall sheathing plumbing drain rough in.

20% due upon completion of electrical rough in, roof, soffit, window, door, siding.

15% due upon completion of pavers and bathroom.

10% due upon completion of remaining line items.

*If there are any material delays, scheduling difficulties or other circumstances that cause any draw items to be delayed, then the Project Manager will adjust draw items based on a schedule of values equal to the original contract.

## WARRANTY INFORMATION

World Construction Inc. warrants all workmanship performed under this agreement for a period of one (1) year from the date of substantial completion. This workmanship warranty covers defects in labor and installation performed by World Construction Inc. or its subcontractors.

Excluded from this warranty are normal wear and tear, damage caused by owner misuse or neglect, damage from acts of nature, and any modifications or repairs performed by parties other than World Construction Inc.

In addition to the workmanship warranty, World Construction Inc. provides a twenty (20) year structural warranty covering the structural integrity of the work performed under this agreement, subject to the same exclusions listed above.

All manufacturer warranties on materials, fixtures, appliances, and equipment installed as part of this project apply separately and are passed through to the Owner in accordance with each manufacturer's terms. World Construction Inc. does not extend or modify manufacturer warranties and is not responsible for manufacturer warranty claims once such warranties are in effect.

## OWNER AND CONTRACTOR RESPONSIBILITIES

### World Construction Inc. Obligations
World Construction Inc. agrees to perform all work described in this proposal in a professional and workmanlike manner, in accordance with applicable building codes and industry standards, and to coordinate all necessary permits and inspections associated with the scope of this agreement.

### Owner Obligations
The Owner agrees to provide World Construction Inc. with reasonable access to the property throughout the duration of construction, to respond to requests for decisions or approvals in a timely manner, and to make payments in accordance with the payment schedule outlined in this agreement.

### Owner Supplied Materials
Any materials in this agreement that is defined as Owner to supply for use in the project, the Owner is responsible for ensuring those materials arrive on site in time to avoid delays to the project schedule. World Construction Inc. is not responsible for delays, defects, or additional costs resulting from owner supplied materials, including but not limited to late delivery, damaged goods, or materials that do not meet code or manufacturer installation requirements. Any additional labor required to install, modify, or correct issues related to owner supplied materials may result in a change order.

### Access and Cooperation
The Owner agrees to provide World Construction Inc. and its subcontractors with unobstructed access to all work areas during agreed working hours. Delays caused by restricted access will extend the project timeline accordingly and may result in additional costs.

### Change Orders
Any work requested by the Owner that falls outside the scope of this agreement must be documented in a written change order, signed by both parties, before that work begins. Change orders will include an adjustment to price and, if applicable, project timeline.

## FINAL PAYMENT TERMS

Final payment becomes due upon final inspection approval, issuance of the Certificate of Occupancy (if applicable), and completion of a mutual punch list walkthrough and signoff by both parties. The Owner agrees to remit final payment within three (3) days of this milestone being reached.

Any outstanding punch list items identified during the final walkthrough will be documented in writing and addressed by World Construction Inc. in a timely manner. Punch list items of a minor, cosmetic nature will not delay final payment provided they are documented and scheduled for completion.

## PERMITS AND INSPECTIONS

World Construction Inc. will coordinate all inspections required in connection with the permitted scope of work under this agreement. Should any inspection require correction or additional work to obtain approval, World Construction Inc. will complete such corrections as necessary. The goal of this agreement is delivery of the contracted work with all required inspections approved and passed, not merely the physical completion of construction.

## CREDIT CARD PAYMENTS

Credit cards accepted with an 2.9% processing fee.

## WIRE INSTRUCTIONS

Regions Bank  
115 3rd St  
Neptune Beach FL, 32266  
062005690 routing  
0280987397 account  
Company name - World Construction Co, inc.

## Questions and Concerns

Please call Brian @ 904-717-1729 Office@worldconstructioninc.com$terms$
WHERE ("slug" = 'world-construction' OR "name" ILIKE 'World Construction%')
  AND ("defaultProposalTerms" IS NULL OR TRIM("defaultProposalTerms") = '');
