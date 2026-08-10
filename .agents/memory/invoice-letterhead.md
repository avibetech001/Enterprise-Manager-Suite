---
name: Invoice letterhead & naira PDFs
description: Client invoices follow the official 5th Element letterhead; jsPDF needs embedded fonts for ₦.
---
- Invoices are itemized (description, quantity, rate, discountPct, vatPct in a jsonb column); totals are recomputed from items (line net = qty×rate×(1−disc%); VAT added on top → Balance Due). Stored `amount` = grand total as a numeric string.
- **Legacy invoices** created before line items have `items: []` — always fall back to the stored `amount` for totals or they display ₦0.00.
- jsPDF's built-in Helvetica has no ₦ (U+20A6) glyph. Noto Sans Regular/Bold TTFs live in ems `src/assets` and are fetched + embedded via `addFileToVFS`/`addFont` at download time. Logo PNG cropped from the user's official invoice PDF is also in assets.
- Letterhead constants (company name, TIN, office address, Access Bank details) are hardcoded in the invoices page — update there if the company details change.
- **Why:** user supplied an official invoice sample (NTA / Changan Eado Plus) and wants invoices to match it exactly.
