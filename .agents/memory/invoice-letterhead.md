---
name: Invoice letterhead & naira PDFs
description: Client invoices follow the official 5th Element letterhead; jsPDF needs embedded fonts for ₦.
---
- Invoice item rows show description, quantity, and rate only. VAT is fixed at 7.5% per item and appears only in totals; legacy discount/VAT values are normalized into an equivalent effective rate so old grand totals remain unchanged.
- **Legacy invoices** created before line items have `items: []` — always fall back to the stored `amount` for totals or they display ₦0.00.
- jsPDF's built-in Helvetica has no ₦ (U+20A6) glyph. Noto Sans Regular/Bold TTFs live in ems `src/assets` and are fetched + embedded via `addFileToVFS`/`addFont` at download time. Branded logo PNGs come from the user's official PDFs; preserve embedded alpha masks when extracting them or edge artifacts appear.
- Letterhead constants (company name, TIN, office address, Access Bank details) are hardcoded in the invoices page — update there if the company details change.
- Part-payments: `payments` jsonb array + status `part_paid`; all payment math is done in **integer kobo** (Math.round(x*100)) — no float tolerances. Legacy paid invoices may have empty payments; treat them as paid-in-full.
- Multi-page branded PDFs must measure every variable-length block, including client details and individual description lines. Continuation pages repeat issuer context and table headings; totals, notes, and bank details move as one protected block.
- **Why:** valid unbounded addresses and long item descriptions can otherwise render beyond the footer before ordinary row pagination reacts.
- **How to apply:** reserve the footer first, split text by remaining line capacity, and start a contextual continuation page whenever the next complete block cannot fit.
- **Why:** user supplied an official invoice sample (NTA / Changan Eado Plus) and wants invoices to match it exactly; review flagged float-tolerance overpayment bugs, hence kobo math.
