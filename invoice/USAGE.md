# Using Invoice Studio

Invoice Studio is an Astro application with a React editor, PostgreSQL invoice records, and authenticated workspaces. Its workbench uses the published Stisla v3 (`@stisla/style`) Tailwind v4 theme and native button and seamless table components. It consumes the public `@oxide/design-system/icons/react` icon barrel rather than repository implementation files.

## Architecture boundaries

- `domain/` owns runtime schemas, inferred TypeScript models, money calculations, semantic addresses, and issuance checks. `model.ts` is the public facade for those modules.
- `application/` owns HTTP contracts, editor state, concurrency handling, and explicit browser recovery/import. It does not calculate taxes or access PostgreSQL directly.
- `server/` owns authentication, owner-scoped persistence, transactional revisions/numbering, and immutable issued PDFs.
- `editor/` owns forms, profile/preset controls, and workspace views. Save and Issue are distinct actions.
- `components/InvoiceDocument.tsx` and document CSS render validated invoice values; they do not save records. `/template-preview` reads the MDX fixture directly, without accessing saved invoices.
- The application consumes published dependencies only. It does not depend on copied design-system components, styles, icons, generators, previews, or token tooling.

Business/client profiles and contract presets are reusable defaults. Applying them copies data into a draft; changing a profile or template never rewrites existing invoices. Issued invoices retain their original PDF, not a re-render using current source code.

## Run the app

From the repository root:

Install the locked dependencies:

```sh
npm ci
cp invoice/.env.example invoice/.env.local
# Fill invoice/.env.local with the managed-service values below.
npm run invoice:migrate
npm run dev
```

Set these canonical variables in `invoice/.env.local` and in the hosted environment:

- `DATABASE_URL` (or `DB_URL`) is the managed Neon application connection string.
- `DATABASE_URL_UNPOOLED` is the direct Neon connection used by `npm run invoice:migrate`.
- `APP_BASE_URL` is the public app origin.
- `NEON_AUTH_BASE_URL` is the Neon Auth URL ending in `/neondb/auth`.
- `NEON_AUTH_COOKIE_SECRET` is a cryptographically random cookie secret.
- `AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, and `INVOICE_PDF_BUCKET` configure the private PDF archive.

Open the URL printed by Astro (normally `http://localhost:4321`), then use the public beta **Sign up** flow and log in. There is no local `invoice:user` provisioning command. The hosted app still requires Neon Auth and object storage; the optional local offline database helper is for tests only.

For a standalone build, run `npm run build` (or `npm run invoice:build`) and deploy `dist-invoice/`. With `VERCEL=1`, the build emits `.vercel/output` instead.

## Create and export an invoice

1. Sign up or sign in and select an invoice, choose **New invoice**, or explicitly **Use example preset**. The workspace does not silently create or select a sample record. Each invoice has its own `/invoices/{id}` URL.
2. Fill in **Details**, add services or products in **Line items**, and review **Payment**. Save reusable business/client/contract defaults through the defaults panel.
3. **Save** writes the draft to PostgreSQL. Empty business fields can be saved; malformed data types cannot. Review field errors before issuing. A revision conflict preserves your edits and requires exporting/reloading rather than overwriting another user's changes.
4. **Print draft** opens the browser's print dialog for working copies. **Issue invoice** assigns its final number and locks the data and original PDF. It requires a saved draft that passes issuance checks.
5. **Original PDF** downloads the archived document. **Export JSON** provides portable data. **Import invoice JSON** creates a separate draft; it never modifies an existing issued invoice.

Browser storage is recovery assistance, not the invoice database. Recoverable unsaved edits are scoped to the signed-in account, invoice ID and saved revision. Restoration is explicit. Old browser-only invoices can be backed up and copied through **Import previous browser invoices**; invalid records are reported individually, retries are idempotent, and the original browser data is never deleted automatically. Browser storage remains origin-specific, so import separately from any old port/origin where records were created.

No email delivery, recurring billing, or payment processing is performed.

## Edit content independently of the layout

The public example design fixture lives in [`content/invoice.mdx`](content/invoice.mdx). Every example invoice value is fictional and lives in its YAML frontmatter; presentation remains in React and CSS. Astro's MDX integration compiles the file, and its frontmatter passes through the shared schema. There is no second seed JSON. Quote dates and numeric-looking identifiers so they remain strings under Astro's YAML parsing.

Open `/template-preview` while designing. It always renders the current MDX fixture, never browser drafts or server records; reload during development or rebuild for production. This route is a public, prerendered fixture: do not put other clients' private invoices in it. Use the authenticated editor for actual records. **Use example preset** explicitly creates a separate working invoice with today's date and an unassigned number. Changing this fixture is not a migration of existing records.

The editor's terminal icon opens a JSON source editor. **Apply source** validates the document before updating the preview. Unapplied edits disable exports; switching away asks before discarding them. Imported text is data, not executable MDX, and React escapes all displayed content.

The runtime schemas in `domain/schema.ts` are the source of truth; TypeScript types are inferred from them and re-exported by [`model.ts`](model.ts):

- `reference`, `brand`, `issued`, `paymentTerms`, and `currency`: document identity, issue date, net days, and currency.
- `from` and `billTo`: business name, address, and `taxId`. New addresses have `line1`, `line2`, `region`, `country`, and `postalCode` fields, formatted into semantic lines. Imported legacy address strings remain unchanged; no parser guesses their locality or country. Optional `taxIdType` opts into `gstin` or `uae-trn` checks at issuance; omitted or `generic` preserves international IDs as text. Optional per-party `taxIdLabel` overrides the invoice-wide label. Optional `pan` is a separate Indian TAXID with an optional `panLabel`.
- The template uses syntactically valid fictional GSTIN/PAN and UAE TRN values for validation coverage. The visual prefix TRN is a label, not part of the stored 15-digit identifier. GSTIN and PAN are not interchangeable.
- Optional `taxLabel`, `taxIdLabel`, `declaration`, and `exchangeNote`: displayed tax labels (IGST/GSTIN in the template), statutory export declaration, and agreed currency conversion text.
- `items`: unique ID, short `description`, supporting `detail`, quantity, unit price, and tax percentage. The numeric tax field remains named `vat` for compatibility. `sac` is an identifier; `unit` describes quantity. Tax stays in the editor and totals, not the table. The header shows a shared quantity unit only when every row uses it; mixed units stay beside each row's quantity. Currency labels belong to the Unit price and Amount headers.
- Optional `secondaryAmount` holds `currency`, `value`, `mode` (`agreed` or `derived`), optional `rate`, and a confirmed `basis` snapshot. Agreed amounts remain fixed and require review when their financial basis changes. Derived amounts follow quantity/price through decimal rounding but never reuse a rate for an unconfirmed currency pair. Use **Confirm amount and rate** after review. Older `{currency, value}` imports remain readable but require confirmation before issuance. Secondary values are not added to totals or parsed from prose notes.
- `payment`: beneficiary, bank, and historical `iban`/`bic` strings; optional `accountNumber`, `ifsc`, and `swift` support Indian payment details. Empty fields are omitted from the document. Older JSON and stored drafts without the new optional fields remain valid.
- `notes`: plain-text payment instructions.

The app supports AED, EUR, USD, GBP, INR, CAD, AUD, and JPY. Issue dates use `YYYY-MM-DD` (2000–2099); an empty date is allowed in a draft. Terms are whole days from 0–365, tax is 0–100%, and quantities/prices are non-negative and at most 1,000,000. Up to 100 items are supported. `parseDraftInvoice` checks safe data shape while allowing incomplete business values; `issuanceProblems` adds required-field, calendar, identifier and monetary checks. Historical `parseInvoice` retains strict import validation for fixtures. Shape-invalid edits remain visible but cannot replace saved records or the last valid preview. There is no automatic server saving. Issuance assigns the final reference instead of requiring a manually reserved number.

GSTIN validation checks the 15-character Indian syntax and, when a separate PAN is supplied, their relationship. PAN checks its ten-character format; UAE TRN checks exactly 15 digits. Typed tax IDs must be complete before issuance; drafts can retain incomplete entries. No unsolicited GST checksum check rejects or rewrites the supplied identifier. These checks do not certify tax registration. Bank fields are bounded strings displayed as supplied; no country-specific account, IBAN, SWIFT, or IFSC rules are imposed without country context.

Line amounts are rounded to the currency's minor unit, then tax is calculated and rounded per rate group. Aggregation stays in BigInt minor units. Issuance bounds the tax-inclusive total to 1,000,000,000,000 currency units; larger historical data can be retained but cannot be issued. JPY uses whole yen; other supported currencies use two decimals.

The example has **AED 12,645.91**, **0% IGST**, and the contractually agreed **INR 3,25,000**. Multiplication by 25.7 gives INR 3,24,999.89 after rounding, a difference of INR 0.11. Generated exchange notes distinguish the agreed amount from the calculated equivalent; the agreed amount is not silently rewritten. Review the rate, amount and statutory wording before issuance. No jurisdiction-specific tax compliance certification is implied.

## Design and font

The document follows the statutory layout in [`../INVOICE_DESIGN.md`](../INVOICE_DESIGN.md), preserving the original reference's dashed outer frame, `+` corners, centered blue title, split seller/metadata header, and bottom-left payment grid. Frame edges and separators are font-rendered characters, with no CSS borders. Its fixed-width A4 composition remains horizontally scrollable inside the mobile preview, without overflowing the page. Document-only typography tokens and used color roles live in `typography.css`, with the same purchased font in screen and print. The editor controls reflow for mobile.

The purchased Berkeley Mono TX-02 variable WOFF2 is self-hosted at `public/fonts/berkeley-mono-tx02.woff2`, preloaded by the Astro layout and registered locally with `@font-face`. Ensure your font license permits your intended hosting and distribution before publishing.

`layouts/StudioLayout.astro` owns the page shell and font preload; `components/InvoiceStudio.astro` mounts the browser-only React editor; `components/InvoiceDocument.tsx` renders the reusable document. The editor remains browser-only so local drafts are never read on a server. Print styles use A4, preserve selectable text and the chosen light/dark document, and paginate longer tables in normal block flow so totals and payment follow the final item. Payment stays together with breathing room above it; unlike the screen preview, print does not use a flexible bottom anchor. The short invoice's reserved table space is a minimum height on an outer block, not a fixed table-body height: Chromium can otherwise paint fragmented rows after the totals and payment. Longer descriptions and tables expand naturally before those closing sections.

The PDF runtime bundles the reusable document and licensed local font assets; its renderer blocks network access and does not expose a loopback token route. Issued PDFs are content-addressed in S3, verified against their SHA-256 digest, and downloaded through 60-second signed redirects. The V1 self-host schema is intentionally refused unless an explicit owner mapping is supplied—never silently move existing data.

`WrappedText.tsx` uses the installed [Kugiri](https://github.com/edoardolunardi/kugiri) package to split addresses and descriptions at the browser's existing line breaks, with no animation or clipping masks. It isolates imperative DOM changes from React, keeps an accessible continuous source, and reverts/re-splits after edits, font loads, and container-width changes. Observers and event handlers are removed on unmount. Printing uses the untouched source and reverts the visual split before print, so A4 wrapping cannot lose text. This does not change the invoice font scale or line geometry.

## Validate changes

```sh
npm test                           # invoice tests (Vitest 4)
npm run invoice:check              # Astro diagnostics + invoice tsc
npm run invoice:format:check       # native Oxfmt plus Astro-only fallback
npm run invoice:prose
```

### Prose linting and formatting

[Vale](https://github.com/vale-cli/vale) is a prose linter, not a formatter. Install the pinned CLI locally when it is missing:

```sh
npm run invoice:vale:install
```

This downloads the official Vale 3.21.0 release for macOS/Linux x64/arm64, checks its pinned SHA-256 digest, and places only the binary in ignored `.tools/vale/`. It does not modify global tools. On other platforms, install Vale 3.21.0 from the official release on PATH. `invoice:prose` prefers the local binary and verifies the version.

`.vale.ini` and `scripts/vale/styles/Invoice/` define project rules for repeated words, unresolved placeholders, and a TRN prefix accidentally embedded in an identifier. Because markup linters can skip frontmatter, the script deterministically extracts **all string values** from the validated MDX template into a local plain-text file, lints it alongside MDX and these two documents, then removes the extraction. No private invoice content goes to an external service. The CLI download is the only network step.

Use `npm run invoice:format` to apply Oxfmt to invoice code, CSS, MDX, tests, and lint tooling. Oxfmt 0.66 supports MDX but not Astro: only `invoice/**/*.astro` is formatted by Prettier with `prettier-plugin-astro` and the explicit `prettier.astro.config.mjs`. `invoice:format:check` checks the same scope without writing. There is no ESLint or general-purpose Prettier pass, and no duplicate formatter for Oxfmt-supported files. Repository policy excludes Markdown and JSON from formatting; Vale checks the prose. No formatter rewrites live draft JSON or supplied tax identifiers.
