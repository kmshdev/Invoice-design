# Invoice Studio

An open-beta invoice editor and authenticated backend-for-frontend (BFF), built with
Astro, React, Neon PostgreSQL, managed Better Auth, and private S3-compatible storage. Draft editing, issuance, recovery, and
immutable PDF exports live in one application—not a publishable design-system fork.

## Quick start

Use Node 24.19 or newer within Node 24, and npm 11 or 12. Development and CI use
Node 24.21.0 and npm 12.0.2; Vercel's compatible bundled versions are also supported.

```sh
npm ci
npm run invoice:browser
cp invoice/.env.example invoice/.env.local
```

Fill the ignored environment file with your Neon branch's database, managed-auth,
and private storage settings. Register the app origin in Neon Auth's trusted domains.
Then run:

```sh
npm run invoice:migrate
npm run invoice:pdf:build
npm run dev
```

Open http://localhost:4321 and create an account or sign in. Registration is open;
every invoice and catalog operation remains scoped to the authenticated account.
There is no default login. Use a separate Neon branch for development, not production.

See [the runbook](invoice/USAGE.md) for all environment variables, migration safety,
PDF requirements, Vercel configuration, and development/testing details.

## Architecture

- `invoice/domain/` and `invoice/model.ts`: invoice validation and calculations.
- `invoice/application/`: shared contracts, browser API client, and workspace state.
- `invoice/editor/` and `invoice/components/`: editor and printable document.
- `invoice/server/`: authentication, persistence, migrations, API handlers, and PDF rendering.
- `invoice/pages/`: thin Astro route adapters and page entry points.
- `invoice/pdf/`: self-contained browser renderer reusing the same document and font.
- `scripts/`: database migrations, local server, and verification commands.

The app consumes the pinned `@oxide/design-system` package through its public
`icons/react` export. Stisla supplies the existing theme/button/table styles; app-owned
CSS preserves the invoice's print contract. Do not copy upstream source into this
repository or add publishing, Figma export, palette-generation, or showcase pipelines.
BFF modules remain local source modules until a real second consumer needs packaging.

## Verification

```sh
npm run invoice:vale:install
npm run check:all
```

The acceptance gate runs lint/format/type checks, domain/client/server tests, template
prose checks, and built-server tests with real PostgreSQL, Chromium PDF rendering,
and editor browser workflows. Editor tests mock API responses to deterministically
exercise conflicts and recovery; server/PDF tests exercise the real API, PostgreSQL,
and Chromium with local auth/S3 protocol fixtures. They need no cloud credentials.
`npm test` is the faster suite; use `npm run invoice:server:test` for the explicit live
server/PDF/editor gate. To run editor browser checks against a running local dev server:

```sh
INVOICE_TEST_BASE_URL=http://localhost:4321 npm run invoice:editor:test
```

## Production build

```sh
npm run build
npm start
```

Configure the environment and apply migrations as described in the runbook first.
Standalone server output is `dist-invoice/`. On Vercel, `VERCEL=1` selects the Vercel
adapter and emits `.vercel/output/`, including Chromium and the self-contained renderer.
PDF downloads redirect to short-lived signed URLs after ownership and integrity checks,
so large documents do not pass through Vercel's response-size limit.

There is no npm release artifact. `private: true` prevents accidental npm publication;
it does not restrict beta registration. CI never publishes canaries.

Legacy self-hosted-auth databases are not silently migrated: account-ID mapping and
archive transfer require an explicit migration. Existing data is left untouched.

## License

The repository retains the [Mozilla Public License 2.0](LICENSE) and attribution on
retained upstream-derived files. The installed design system carries its own notices.
