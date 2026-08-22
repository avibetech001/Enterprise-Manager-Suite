---
name: Invoice letterhead & naira PDFs
description: Client invoices follow the official 5th Element letterhead; jsPDF needs embedded fonts for ₦.
---
- Invoices are itemized without discounts: description, quantity, rate, and VAT. Historic discounted items are returned using their effective final rate so old totals remain unchanged while discount stays hidden.
- **Legacy invoices** created before line items have `items: []` — always fall back to the stored `amount` for totals or they display ₦0.00.
- jsPDF's built-in Helvetica has no ₦ (U+20A6) glyph. Noto Sans Regular/Bold TTFs live in ems `src/assets` and are fetched + embedded via `addFileToVFS`/`addFont` at download time. Logo PNG cropped from the user's official invoice PDF is also in assets.
- Letterhead constants (company name, TIN, office address, Access Bank details) are hardcoded in the invoices page — update there if the company details change.
- Part-payments: `payments` jsonb array + status `part_paid`; all payment math is done in **integer kobo** (Math.round(x*100)) — no float tolerances. Legacy paid invoices may have empty payments; treat them as paid-in-full.
- **Why:** user supplied an official invoice sample (NTA / Changan Eado Plus) and wants invoices to match it exactly; review flagged float-tolerance overpayment bugs, hence kobo math.
