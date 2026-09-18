# Export invoice design contract

## Scope and implementation

The invoice document remains governed by this contract. The Shardlane platform expansion is documented in `docs/PLATFORM_DESIGN.md`; it may redesign surrounding chrome without changing the locked document composition. Use Astro with reusable layout/components and Stisla v3's actual Tailwind v4 tokens and BEM classes where applicable. Preserve working editable content, calculations, local drafts, JSON import/export, and browser PDF export. Keep client-specific statutory data editable and independent from layout, rather than hard-coding it into presentation.

Use the purchased TX-02 web font supplied as `Berkeley Mono Variable.woff2`, registered as Berkeley Mono. Dark terminal aesthetic: very dark neutral background, muted labels, white values, consistent text sizes and spacing, tabular numbers and right-aligned financial columns. Use ASCII bracket headings. No CSS borders anywhere in the invoice document: create dividers with font-rendered dashes or box-drawing characters. App chrome is outside this restriction.

## Locked visual authority — original attached reference

The user's original attached image is the visual authority. This is a content and line-item extension of that design, **not a new visual direction**. Preserve its portrait A4 composition: #161616 paper, approximately 7.5% outside margins, a thin muted **dashed outer rectangle with `+` corners**, and the centered blue `[ Invoice - amount ]` interrupting the top edge. All frame edges and separators are rendered with typography, never CSS borders.

Inside the frame, use a small inset (approximately 2% of page width). Keep seller/brand upper-left and compact right-aligned Ref/Issued/Due upper-right; a full-width dashed separator; two equal address columns with bracket headings; generous breathing room before the table; broad descriptions, muted headers, uniformly sized mono values, and right-aligned financial columns. Retain the full-width dashed table bottom, right-side plain-text totals with a short dashed rule before the bold total, and generous space before bottom-left Payment aligned with the address column.

Add the declaration unobtrusively at full width above the addresses and SAC in the table, and the exact agreed INR/payment details without changing that composition. No cards, banner blocks, extra decorative headings, solid rules, or oversized typography. This correction supersedes any earlier interpretation that removed the frame or moved/enlarged the title.

## Divider inventory and typography roles

The reference has exactly four full-width interior rules: after the header, above the table column labels, below those labels, and below the complete item list. A fifth, short rule spans only the totals columns before Total due. Do not add rules around the declaration, addresses, individual items, or payment. The outer rectangle is separate from these five rules.

Rules use actual Berkeley Mono hyphens, #454545 on #161616, with 0.5em tracking (approximately 13.2px pitch at preview size). Vertical pipe glyphs use 1.65em pitch, leaving visibly larger segments and gaps. Render only enough glyphs for the measured edge; no thousands-character decoration strings. Corners remain plus signs. Decoration is hidden from assistive technology and cannot be selected.

| Role | Preview size | Weight / treatment |
| --- | --- | --- |
| Sender/brand | 18px | 600, primary white |
| Centered bracket title | 12px | 400, target blue #76a9fa |
| All bracket section headings | 12px | 400, same target blue |
| Business names / Total due | 12px | 600, primary white |
| Item descriptions / financial and payment values | 12px | 400, primary white, tabular amounts |
| Addresses / metadata labels / table labels / payment labels | 12px | 400, muted #b1b1b1 |
| Statutory declaration | 10px | 400, muted, upright |
| Added exchange-rate explanation | 10px | 400, muted, italic |

For the example A4 template, the table top is approximately 34.3% down the sheet, the column-header rule 37.9%, and the item-list bottom 57.5%. Reserve a 16em minimum table body so a single item retains the reference's open space; longer content expands naturally. Keep the payment block bottom-aligned rather than removing required banking rows to mimic the shorter example.

Only explanatory exchange text is italicized; core legal, identity and financial data remains upright. Print scales the same role ratios to A4 (base 9.65pt). Keep equal address columns and the reference's generous table/payment spacing. This document is a print-first artifact; these sizes are not the surrounding app's web typography scale.

## Public example invoice content

These fictional particulars are safe public demonstration data, not legal defaults or real payment instructions. Preserve their layout and calculation behavior through design iterations.

### Header

- Title: `[ Invoice - AED 12,645.91 ]`
- Ref: `DEMO-2026-0601`
- Issued: `30 Jun 2026`
- Due: `15 Jul 2026`

### Statutory declaration

Full width, above addresses, verbatim:

SUPPLY MEANT FOR EXPORT UNDER BOND OR LETTER OF UNDERTAKING WITHOUT PAYMENT OF INTEGRATED TAX

### Addresses

- `[ From ]`: Aster Demo Labs, 42 Example Avenue, Demo District, Sample City, Example State, India 400001. GSTIN: 27ABCDE1234F1Z5. Separate TAXID (PAN): ABCDE1234F.
- `[ Bill to ]`: Example Systems FZCO, Building 7, Sample Business Park, Demo District, Dubai, UAE. TRN: 999999999999999 (15 digits; TRN is the label).

### Line items

| Description | SAC Code | Qty | Unit Price | Amount |
| :--- | ---: | ---: | ---: | ---: |
| Technology consultancy — Design, development, and maintenance of fintech platforms | 998314 | 1 month | AED 12,645.91 | AED 12,645.91 / INR 3,25,000 |

### Totals

Right-aligned below the table:

- Subtotal excl. IGST: AED 12,645.91
- IGST 0%: AED 0.00
- Total due: AED 12,645.91
- Sub-text: `(Agreed Exchange Rate: AED 1 = INR 25.7 | Total INR: 3,25,000)`

Preserve the agreed INR amount as supplied, independently of computed conversion: AED 12,645.91 × 25.7 is INR 3,24,999.887, which rounds to INR 3,25,000 at whole-rupee precision. Do not silently change the contract's displayed values.

### Payment

Bottom left, heading `[ Payment ]`:

- Beneficiary: ASTER DEMO LABS
- Account No: 0000000000000000
- Bank: Example Bank, Sample Branch
- IFSC: TEST0000000
- SWIFT: TESTINBBXXX

## Acceptance checks

- All particulars above visible in preview and PDF, with no missing or clipped fields.
- Consistent invoice type scale, readable print size, aligned financial values, no CSS borders in the document.
- Purchased web font loads locally; no third-party font request.
- Reference renders as a single A4 page; longer invoices can paginate without losing content.
- Existing drafts are preserved, not silently overwritten by the new template.
- Client-specific fields remain editable and survive JSON round-trip and reload.
- Interactive desktop/mobile checks cover editing, totals, source import/export, saved drafts and print behavior.

## Template and validation contract

Maintain all starting invoice values in `invoice/content/invoice.mdx` YAML frontmatter, compiled by Astro MDX and checked by the TypeScript runtime validator before use. UI labels and geometry belong to presentation; financial, statutory, identity, address, and payment values do not. Browser source editing and imports remain validated, non-executable JSON. Existing drafts must never be silently migrated to a new person's identifiers; the explicit example template action adds a separate draft.

Use independent per-party tax types and labels. The seller GSTIN and separate TAXID (PAN) must both render; the client's UAE identity must render as TRN, never as GSTIN. Typed identifiers receive format validation, with GSTIN/PAN matching when both are supplied, but no unrequested checksum rejection or mutation. Legacy generic VAT and international bank references remain supported. Invalid edits show errors and retain the last valid preview and saved draft.

Use the installed Kugiri line-splitting engine for addresses and descriptions without masks or animation. Re-split after edits, fonts, and width changes; isolate its DOM from React and remove observers on cleanup. Preserve a continuous accessible source and use that source for print rather than frozen screen lines. Keep authored newlines and the existing font metrics, frame, rule inventory, and table geometry. Author both template addresses as three semantic lines in MDX, not arbitrary length-based slices. Sender: `42 Example Avenue` / `Demo District, Sample City` / `Example State, India, PIN: 400001` (street, locality/city, state/country/postal code). Retain India for the overseas recipient. Recipient: building/business park / district / city/country; do not invent a UAE postal code. Compact address lines should leave clear central whitespace between the two parties. Align the complete From block to the left content edge and the complete Bill to block to the right content edge, including headings, names, addresses, and tax identifiers; retain the inset from the dashed frame.

Lint actual template prose locally with Vale, including deterministically extracted frontmatter strings; use the existing Prettier formatter for code and MDX. See `invoice/USAGE.md` for reproducible commands and the project-local CLI installation.

## Five-column table refinement

The five-column table supersedes the earlier six-column design: Description, SAC Code, Qty, Unit Price, Amount. Omit SAC only for drafts with no SAC data. Tax remains editable and calculated by rate in totals, but has no line-item column. Use the installed Stisla native `.table.table--seamless` component CSS and its padding/head tokens, without table JavaScript. Align headers with their cells: description left, identifiers/quantity/financial values right; provide real cell gutters rather than textual padding. Preserve typographic rules, not cell borders.

Use `invoice/typography.css` for document-scoped Berkeley Mono font, body/print size, leading, weight and used color roles. Keep the A4 density rather than forcing long prose measures into the table. The template description is a short blue heading, with muted, upright detail below preserving the full service scope. Both strings are authored independently in MDX; legacy descriptions are displayed as authored, without client-specific parsing or migration.

Show the primary line amount in tabular, preformatted currency notation and optional `secondaryAmount: { currency, value }` below. For this template the secondary amount is independently agreed INR 325000, formatted `INR 3,25,000`, not a conversion inferred from exchange text. Optional secondary amounts have supported-currency and finite non-negative value validation (up to 1,000,000,000,000), form editing, and JSON/MDX round-trip support. They do not affect tax or totals, do not multiply by quantity, and do not update automatically when prices change. Omission preserves legacy drafts. Template edits never reset saved drafts; use the explicit template action to add a new one.
