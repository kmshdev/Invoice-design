# Using Invoice Studio

Invoice Studio is a local-first Astro application with a reusable React invoice editor island. Its workbench uses the published Stisla v3 (`@stisla/style`) Tailwind v4 theme and native button and seamless table components, retaining the repository's Oxide icons. It is separate from the design-system showcase, which remains available with `npm run preview:dev`.

## Run the app

From the repository root:

```sh
npm ci
npm run dev
```

Open the URL printed by Astro (normally `http://localhost:4321`). For a production build, run `npm run invoice:build`; the static site is written to `dist-invoice/`.

## Create and export an invoice

1. Edit the supplied Meeshu export invoice or choose **Meeshu export template** in the invoice library to add a fresh statutory template without changing any saved draft. **New invoice** instead retains the active draft's business, currency, terms, export particulars, and payment information, but clears the client and line items.
2. Fill in **Details**, add services or products in **Line items**, and review **Payment**.
3. Review the live document. Use the sun/moon controls to choose a light or dark document.
4. Select **Export PDF**, then **Save as PDF** in your browser's print dialog. Use A4 paper, disable browser headers/footers, and enable background graphics for the dark document. Light mode is useful for economical printing.
5. Select **Export JSON** below the preview to keep a portable backup. **Import invoice JSON** adds a file as a separate draft.

Drafts automatically save in this browser's local storage. They are not synchronized across devices or browsers. Clearing site data removes them. Export backups before clearing data or changing the app's origin. No email delivery, recurring billing, or payment processing is performed.

## Edit content independently of the layout

The single starting template lives in [`content/invoice.mdx`](content/invoice.mdx). Every invoice value is in its YAML frontmatter; presentation remains in React and CSS. Astro's official MDX integration compiles this actual MDX file, and `InvoiceStudio.astro` validates its frontmatter with `parseInvoice` before passing data to the editor. There is no second seed JSON. Use YAML literal blocks (`|-`) for addresses or descriptions to preserve intentional newlines. Quote dates and numeric-looking identifiers so they remain strings under Astro’s YAML parsing.

This is a developer-maintained template, not a new runtime editing workflow. Rebuild after changing it. Browsers with existing drafts keep those drafts unchanged. Choose **Meeshu export template** to add the updated template alongside them, or explicitly edit an existing draft's identities in **Details**. Do not clear local storage to upgrade a draft.

The editor's terminal icon opens a JSON source editor. **Apply source** validates the document before updating the preview. Unapplied edits disable exports; switching away asks before discarding them. Imported text is data, not executable MDX, and React escapes all displayed content.

The schema is defined by `Invoice` in [`model.ts`](model.ts):

- `reference`, `brand`, `issued`, `paymentTerms`, and `currency`: document identity, issue date, net days, and currency.
- `from` and `billTo`: business name, multiline address, and `taxId`. Optional `taxIdType` opts into `gstin` or `uae-trn` validation; omitted or `generic` keeps international/legacy IDs as text. Optional per-party `taxIdLabel` overrides the legacy invoice-wide label. Optional `pan` is a separate Indian TAXID, with an optional `panLabel`.
- The template seller has GSTIN **09DCNPM8210C1ZL**, separate TAXID (PAN) **DCNPM8210C**, and the client has TRN **105071208000001**. The visual prefix TRN is a label, not part of the stored 15-digit identifier. GSTIN and PAN are not interchangeable.
- Optional `taxLabel`, `taxIdLabel`, `declaration`, and `exchangeNote`: displayed tax labels (IGST/GSTIN in the template), statutory export declaration, and agreed currency conversion text.
- `items`: unique ID, description, detail, quantity, unit price, and tax percentage. The numeric tax field remains named `vat` for compatibility. Optional `sac` and `unit` display the SAC code and quantity unit. Tax stays in the editor and totals, not the table. Use a short `description` heading and supporting `detail`. Optional `secondaryAmount: { currency: INR, value: 325000 }` displays an independently agreed line amount beneath the primary amount (`INR 3,25,000`). Choose a secondary currency and enter its amount in Line items; choose None to remove it. Supported currencies and finite values from zero to 1,000,000,000,000 are validated. Secondary values do not affect totals or follow price/quantity edits; review them before issuing. They are not parsed from `exchangeNote`.
- `payment`: beneficiary, bank, and historical `iban`/`bic` strings; optional `accountNumber`, `ifsc`, and `swift` support Indian payment details. Empty fields are omitted from the document. Older JSON and stored drafts without the new optional fields remain valid.
- `notes`: plain-text payment instructions.

The app supports AED, EUR, USD, GBP, INR, CAD, AUD, and JPY. Dates use `YYYY-MM-DD` (2000–2099), terms are whole days from 0–365, VAT is 0–100%, and quantities/prices are non-negative and at most 1,000,000. Up to 100 items are supported. Every imported field and form update goes through the same runtime validator in `model.ts`, including optional text fields, numeric ranges, unique line IDs, and calendar dates. Invalid form edits remain visible with field errors but are not saved or used for the preview. Fix the errors to resume automatic saving. Exports are disabled until valid; leaving invalid edits asks before discarding them. Incomplete generic drafts can still be saved; PDF export additionally requires names, a reference, and usable items.

GSTIN validation checks the 15-character Indian syntax and, when a separate PAN is supplied, their relationship. PAN checks its ten-character format; UAE TRN checks exactly 15 digits. Typed tax IDs cannot be empty; select generic for an untyped/incomplete identity. No unsolicited GST checksum check rejects or rewrites the supplied identifier. These checks do not certify tax registration. Bank fields are bounded strings displayed as supplied; no country-specific account, IBAN, SWIFT, or IFSC rules are imposed without country context.

Line amounts are rounded to the currency's minor unit, then tax is calculated and rounded per rate group. JPY uses whole yen; other supported currencies use two decimals. The supplied example reconciles to **AED 12,645.91**, with **0% IGST**. The agreed exchange-rate/INR text is independently editable, not a calculated currency conversion; changing invoice amounts does not silently rewrite it. Review this text and the declaration before issuing an edited invoice. Confirm the rounding policy meets your jurisdiction's accounting requirements.

## Design and font

The document follows the statutory layout in [`../INVOICE_DESIGN.md`](../INVOICE_DESIGN.md), preserving the original reference's dashed outer frame, `+` corners, centered blue title, split seller/metadata header, and bottom-left payment grid. Frame edges and separators are font-rendered characters, with no CSS borders. Its fixed-width A4 composition remains horizontally scrollable inside the mobile preview, without overflowing the page. Document-only typography tokens and used color roles live in `typography.css`, with the same purchased font in screen and print. The editor controls reflow for mobile.

The purchased Berkeley Mono TX-02 variable WOFF2 is self-hosted at `public/fonts/berkeley-mono-tx02.woff2`, preloaded by the Astro layout and registered locally with `@font-face`. Ensure your font license permits your intended hosting and distribution before publishing.

`layouts/StudioLayout.astro` owns the page shell and font preload; `components/InvoiceStudio.astro` mounts the browser-only React editor; `components/InvoiceDocument.tsx` renders the reusable document. The editor remains browser-only so local drafts are never read on a server. Print styles use A4, preserve selectable text and the chosen light/dark document, and paginate longer tables in normal block flow so totals and payment follow the final item. Payment stays together with breathing room above it; unlike the screen preview, print does not use a flexible bottom anchor. The short invoice's reserved table space is a minimum height on an outer block, not a fixed table-body height: Chromium can otherwise paint fragmented rows after the totals and payment. Longer descriptions and tables expand naturally before those closing sections.

`WrappedText.tsx` uses the installed [Kugiri](https://github.com/edoardolunardi/kugiri) package to split addresses and descriptions at the browser's existing line breaks, with no animation or clipping masks. It isolates imperative DOM changes from React, keeps an accessible continuous source, and reverts/re-splits after edits, font loads, and container-width changes. Observers and event handlers are removed on unmount. Printing uses the untouched source and reverts the visual split before print, so A4 wrapping cannot lose text. This does not change the invoice font scale or line geometry.

## Validate changes

```sh
npm run invoice:check
npm run invoice:build
npm test -- --run test/invoice.test.ts
npx eslint invoice test/invoice.test.ts scripts/invoice-prose.ts scripts/invoice-template.mjs scripts/install-vale.mjs
npm run invoice:format:check
npm run invoice:prose
```

### Prose linting and formatting

[Vale](https://github.com/vale-cli/vale) is a prose linter, not a formatter. Install the pinned CLI locally when it is missing:

```sh
npm run invoice:vale:install
```

This downloads the official Vale 3.21.0 release for macOS/Linux x64/arm64, checks its pinned SHA-256 digest, and places only the binary in ignored `.tools/vale/`. It does not modify global tools. On other platforms, install Vale 3.21.0 from the official release on PATH. `invoice:prose` prefers the local binary and verifies the version.

`.vale.ini` and `scripts/vale/styles/Invoice/` define project rules for repeated words, unresolved placeholders, and a TRN prefix accidentally embedded in an identifier. Because markup linters can skip frontmatter, the script deterministically extracts **all string values** from the validated MDX template into a local plain-text file, lints it alongside MDX and these two documents, then removes the extraction. No private invoice content goes to an external service. The CLI download is the only network step.

Use `npm run invoice:format` to apply the existing Prettier configuration to invoice code, MDX, tests, and lint tooling. `invoice:format:check` checks that same scope without writing. Repository policy excludes Markdown documents from formatting; Vale checks their prose. No formatter rewrites live draft JSON or supplied tax identifiers.
